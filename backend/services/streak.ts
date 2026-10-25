import pool from '../db';
import { appToday, type RequestClock } from './appTime';

/**
 * Личная серия, заморозки и недельная цель.
 *
 * «День с уборкой» — любой закрытый пункт: отметка в журнале
 * `task_completions` (своя задача или дело дома: считается тот, кто закрыл,
 * `completed_by` — а не владелец расписания), закрытая задача челленджа или
 * отметка привычки.
 *
 * Дни всех трёх источников приводятся к одному календарному дню в поясе
 * приложения (services/appTime.ts): у задач дома день — это `completed_on`
 * (дата), у челленджей момент `done_at` переводится помощником `sqlAppDate`,
 * у привычек `completed_on` — уже дата. «Сегодня» берётся там же (`appToday`),
 * потому что отметку ставит `PUT /api/tasks/:id` именно на этот день: с
 * локальной датой сервера галочка после местной полуночи не попадала бы в серию.
 *
 * Журнал — источник истории по дням, поэтому снятие галочки убирает только
 * сегодняшнюю отметку: закрытые ранее дни остаются закрытыми.
 *
 * Серия не хранится как счётчик: она вычисляется из активности, иначе любая
 * правка истории (снял галочку, удалил задачу) расходилась бы с базой.
 * Хранятся только заморозки — они «закрывают» пропущенный день, и цель на неделю.
 */

const DAY_MS = 86_400_000;
const FREEZES_PER_MONTH = 2;
const FREEZES_MAX = 3;
const ACTIVITY_WINDOW_DAYS = 400;

/**
 * Часы запроса по умолчанию: день и пояс приложения.
 *
 * Нужны для вызовов без запроса (тесты, фоновые задачи). Снаружи часы приходят из
 * `requestClock` — день устройства и смещение его пояса.
 */
const appClock = (): RequestClock => ({ today: appToday(), offsetMinutes: 0 });

/**
 * День момента отметки в поясе человека.
 *
 * `completed_at` лежит в UTC (`timestamp without time zone`), поэтому день — это
 * момент плюс смещение пояса. Смещение приходит из запроса и подставляется
 * параметром, а не литералом: так DST у клиента учитывается сам собой, а в SQL не
 * попадает ничего из заголовков напрямую.
 */
const dayOfMoment = (column: string, offsetParam: string): string =>
  `((${column} + ${offsetParam}::int * interval '1 minute'))::date`;

const toIso = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const shift = (iso: string, delta: number): string => {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return toIso(date);
};

const diffDays = (from: string, to: string): number =>
  Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY_MS);

/**
 * Дни, когда пользователь что-то закрыл.
 *
 * Задачи считаются по **моменту отметки**, а не по дню дела: человек может
 * отметить задачу за прошлый или будущий день (`completed_on`), и если считать по
 * нему, серия «уезжала» в прошлое, а сегодняшний день оставался пустым. Поэтому
 * для задач день активности — `task_completions.completed_at`, переведённый в пояс
 * человека (смещение приходит из запроса): отметка в 00:30 по Владивостоку — это
 * сегодняшний день у него, хотя по Москве ещё вчера.
 *
 * У привычек `completed_on` — уже дата, её переводить не нужно. У челленджей
 * момент `done_at` переводится тем же смещением.
 *
 * Условие авторства прежнее: закрыл я (`completed_by`) либо закрыто без автора в
 * моём личном расписании (старые отметки до появления колонки).
 */
const loadActivity = async (userId: string, clock: RequestClock): Promise<Set<string>> => {
  const since = shift(clock.today, -ACTIVITY_WINDOW_DAYS);
  const momentDay = dayOfMoment('c.completed_at', '$2');

  const result = await pool.query<{ day: string }>(
    `SELECT day::text AS day FROM (
       SELECT ${momentDay} AS day
         FROM task_completions c
         JOIN tasks t ON t.id = c.task_id
         JOIN schedules s ON s.id = t.schedule_id
        WHERE (c.completed_by = $1 OR (c.completed_by IS NULL AND s.user_id = $1))
          AND ${momentDay} >= $3::date
       UNION
       SELECT ${dayOfMoment('p.done_at', '$2')} AS day
         FROM user_task_progress p
         JOIN user_challenges uc ON uc.id = p.user_challenge_id
        WHERE uc.user_id = $1 AND p.is_done
          AND ${dayOfMoment('p.done_at', '$2')} >= $3::date
       UNION
       SELECT c.completed_on AS day
         FROM habit_completions c
         JOIN user_habits h ON h.id = c.user_habit_id
        WHERE h.user_id = $1
          AND c.completed_on >= $3::date
     ) AS activity`,
    [userId, clock.offsetMinutes, since]
  );

  return new Set(result.rows.map((row) => row.day));
};

/**
 * Дни отпуска: в это время человек не убирается, и серия за это не наказывает.
 *
 * День отпуска — «мост» между активными днями: он не считается активным (серия не
 * растёт из воздуха), но и пропуском не считается, поэтому отрезок не рвётся.
 * Заморозки на такие дни не тратятся — они уже закрыты отпуском.
 *
 * Дни разворачиваем из периодов в окне активности: держать в памяти месяцы
 * отпуска незачем, а серия всё равно считается не дальше этого окна.
 */
const loadVacationDays = async (userId: string, clock: RequestClock): Promise<Set<string>> => {
  const result = await pool.query<{ day: string }>(
    `SELECT series.day::text AS day
       FROM vacation_periods v
       CROSS JOIN LATERAL (
         SELECT generate_series(
                  GREATEST(v.started_on, ($3::date - ($2 || ' days')::interval)::date),
                  LEAST(COALESCE(v.ended_on, $3::date), $3::date),
                  INTERVAL '1 day'
                )::date AS day
       ) AS series
      WHERE v.user_id = $1
        AND v.started_on <= $3::date
        AND COALESCE(v.ended_on, $3::date) >= ($3::date - ($2 || ' days')::interval)::date`,
    [userId, ACTIVITY_WINDOW_DAYS, clock.today]
  );

  return new Set(result.rows.map((row) => row.day));
};

/** Закрытые заморозками дни. */
const loadCovered = async (userId: string): Promise<Set<string>> => {
  const result = await pool.query<{ covered_on: string }>(
    'SELECT covered_on::text AS covered_on FROM streak_freezes WHERE user_id = $1',
    [userId]
  );

  return new Set(result.rows.map((row) => row.covered_on));
};

/** Догоняем заморозки за новый месяц: накопление до трёх штук. */
const ensureFreezes = async (userId: string, today: string): Promise<number> => {
  const existing = await pool.query<{ freezes_available: number; refilled: string | null }>(
    `SELECT freezes_available, freezes_refilled_on::text AS refilled
       FROM user_streak_state WHERE user_id = $1`,
    [userId]
  );

  const currentMonth = today.slice(0, 7);

  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO user_streak_state (user_id, freezes_available, freezes_refilled_on)
       VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING`,
      [userId, FREEZES_PER_MONTH, today]
    );
    return FREEZES_PER_MONTH;
  }

  const row = existing.rows[0];

  if ((row.refilled ?? '').slice(0, 7) === currentMonth) {
    return Number(row.freezes_available);
  }

  const next = Math.min(FREEZES_MAX, Number(row.freezes_available) + FREEZES_PER_MONTH);

  await pool.query(
    `UPDATE user_streak_state
        SET freezes_available = $2, freezes_refilled_on = $3, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1`,
    [userId, next, today]
  );

  return next;
};

/**
 * Закрываем заморозками короткие пропуски между активными днями.
 *
 * Только «внутренние» пропуски: если человек пропал на месяц, заморозки
 * тратить бессмысленно, серия всё равно прервана. Пропуск длиннее, чем
 * остаток заморозок, не трогаем — частичное закрытие ничего не даёт.
 */
const coverGaps = async (userId: string, effective: Set<string>, available: number) => {
  const days = [...effective].sort();

  if (days.length < 2 || available <= 0) {
    return available;
  }

  const gaps: string[][] = [];

  for (let index = 1; index < days.length; index += 1) {
    const missed = diffDays(days[index - 1], days[index]) - 1;

    if (missed <= 0) {
      continue;
    }

    const list: string[] = [];
    for (let step = 1; step <= missed; step += 1) {
      list.push(shift(days[index - 1], step));
    }
    gaps.push(list);
  }

  const covered: string[] = [];

  // Свежие пропуски закрываем первыми: старые уже не спасают текущую серию
  for (const gap of gaps.reverse()) {
    if (gap.length > available) {
      break;
    }
    covered.push(...gap);
    available -= gap.length;
  }

  if (covered.length === 0) {
    return available;
  }

  await pool.query(
    `INSERT INTO streak_freezes (user_id, covered_on)
     SELECT $1, unnest($2::date[])
     ON CONFLICT (user_id, covered_on) DO NOTHING`,
    [userId, covered]
  );

  await pool.query(
    'UPDATE user_streak_state SET freezes_available = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
    [userId, available]
  );

  for (const day of covered) {
    effective.add(day);
  }

  return available;
};

/** Непрерывные отрезки активных (и закрытых заморозкой) дней. */
const buildRuns = (effective: Set<string>): string[][] => {
  const runs: string[][] = [];

  for (const day of [...effective].sort()) {
    const last = runs[runs.length - 1];

    if (last && diffDays(last[last.length - 1], day) === 1) {
      last.push(day);
    } else {
      runs.push([day]);
    }
  }

  return runs;
};

/** Понедельник текущей недели: цель недельная, неделя начинается с понедельника. */
const startOfWeek = (today: string): string => {
  const weekday = new Date(`${today}T00:00:00`).getDay(); // 0 — воскресенье
  return shift(today, weekday === 0 ? -6 : 1 - weekday);
};

export interface StreakState {
  today: string;
  current: number;
  best: number;
  todayDone: boolean;
  lastActiveOn: string | null;
  freezesAvailable: number;
  freezesUsedTotal: number;
  /** Режим отпуска: включён ли сейчас и с какого дня. */
  vacation: {
    active: boolean;
    startedOn: string | null;
  };
  week: {
    start: string;
    days: Array<{ date: string; active: boolean; isToday: boolean }>;
    activeDays: number;
    target: number;
    met: boolean;
  };
}

/**
 * Состояние серии на часы запроса.
 *
 * `clock` необязателен: без него считаем по поясу приложения (тесты, фоновые
 * задачи). Снаружи он приходит из `requestClock` — день человека и смещение его
 * пояса, и тогда «сегодня» в серии совпадает с тем, что человек видит на экране.
 */
export const getStreakState = async (
  userId: string,
  clock: RequestClock = appClock(),
): Promise<StreakState> => {
  const today = clock.today;
  const activity = await loadActivity(userId, clock);
  const covered = await loadCovered(userId);
  const vacationDays = await loadVacationDays(userId, clock);
  const freezes = await ensureFreezes(userId, today);

  /**
   * `counted` — дни, которые идут в счёт серии: настоящая активность и заморозки.
   * `effective` — по ним строятся отрезки: плюс дни отпуска, которые разрывать
   * серию не должны. Длина отрезка считается по `counted`, поэтому двухнедельный
   * отпуск не превращается в двухнедельную серию.
   */
  const counted = new Set([...activity, ...covered]);
  const effective = new Set([...counted, ...vacationDays]);
  const freezesLeft = await coverGaps(userId, effective, freezes);

  const lengthOf = (run: string[]): number => run.filter((day) => counted.has(day)).length;
  const runs = buildRuns(effective);
  const yesterday = shift(today, -1);
  const currentRun = runs.find((run) => {
    const last = run[run.length - 1];
    return last === today || last === yesterday;
  });

  const openVacation = await pool.query<{ started_on: string }>(
    `SELECT started_on::text AS started_on
       FROM vacation_periods
      WHERE user_id = $1 AND ended_on IS NULL
      ORDER BY started_on DESC
      LIMIT 1`,
    [userId]
  );

  const used = await pool.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM streak_freezes WHERE user_id = $1',
    [userId]
  );

  const goal = await pool.query<{ weekly_days: number }>(
    'SELECT weekly_days FROM user_goals WHERE user_id = $1',
    [userId]
  );

  const target = Number(goal.rows[0]?.weekly_days ?? 5);
  const weekStart = startOfWeek(today);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = shift(weekStart, index);
    return { date, active: activity.has(date), isToday: date === today };
  });
  const activeDays = weekDays.filter((day) => day.active).length;

  const activeList = [...activity].sort();
  const todayDone = activity.has(today);

  return {
    today,
    current: currentRun ? lengthOf(currentRun) : 0,
    best: runs.reduce((max, run) => Math.max(max, lengthOf(run)), 0),
    todayDone,
    lastActiveOn: todayDone ? today : (activeList[activeList.length - 1] ?? null),
    freezesAvailable: freezesLeft,
    freezesUsedTotal: Number(used.rows[0]?.total ?? 0),
    vacation: {
      active: openVacation.rows.length > 0,
      startedOn: openVacation.rows[0]?.started_on ?? null,
    },
    week: {
      start: weekStart,
      days: weekDays,
      activeDays,
      target,
      met: activeDays >= target,
    },
  };
};

/**
 * Включить режим отпуска.
 *
 * Идемпотентно: частичный уникальный индекс (миграция 0021) не даёт завести второй
 * открытый отпуск, поэтому повторное нажатие ничего не ломает и не плодит строк.
 */
export const startVacation = async (
  userId: string,
  clock: RequestClock = appClock(),
): Promise<void> => {
  await pool.query(
    `INSERT INTO vacation_periods (user_id, started_on)
     SELECT $1, $2::date
      WHERE NOT EXISTS (
        SELECT 1 FROM vacation_periods WHERE user_id = $1 AND ended_on IS NULL
      )`,
    [userId, clock.today]
  );
};

/** Выключить режим отпуска: открытый период закрывается сегодняшним днём. */
export const endVacation = async (
  userId: string,
  clock: RequestClock = appClock(),
): Promise<void> => {
  await pool.query(
    `UPDATE vacation_periods
        SET ended_on = $2::date
      WHERE user_id = $1 AND ended_on IS NULL`,
    [userId, clock.today]
  );
};

/** Изменить недельную цель (1–7 дней). */
export const setWeeklyGoal = async (userId: string, weeklyDays: number): Promise<void> => {
  await pool.query(
    `INSERT INTO user_goals (user_id, weekly_days, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE
       SET weekly_days = EXCLUDED.weekly_days, updated_at = CURRENT_TIMESTAMP`,
    [userId, weeklyDays]
  );
};
