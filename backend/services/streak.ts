import pool from '../db';

/**
 * Личная серия, заморозки и недельная цель.
 *
 * «День с уборкой» — любой закрытый пункт: своя задача, задача челленджа,
 * отметка привычки или задача семейного плана (тогда смотрим, кто именно
 * закрыл — `tasks.completed_by`).
 *
 * Серия не хранится как счётчик: она вычисляется из активности, иначе любая
 * правка истории (снял галочку, удалил задачу) расходилась бы с базой.
 * Хранятся только заморозки — они «закрывают» пропущенный день, и цель на неделю.
 */

const DAY_MS = 86_400_000;
const FREEZES_PER_MONTH = 2;
const FREEZES_MAX = 3;
const ACTIVITY_WINDOW_DAYS = 400;

const toIso = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export const todayIso = (): string => toIso(new Date());

const shift = (iso: string, delta: number): string => {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return toIso(date);
};

const diffDays = (from: string, to: string): number =>
  Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY_MS);

/** Дни, когда пользователь что-то закрыл. */
const loadActivity = async (userId: string): Promise<Set<string>> => {
  const result = await pool.query<{ day: string }>(
    `SELECT day::text AS day FROM (
       SELECT DATE(t.completed_at) AS day
         FROM tasks t
         JOIN schedules s ON s.id = t.schedule_id
        WHERE t.is_completed
          AND (t.completed_by = $1 OR (t.completed_by IS NULL AND s.user_id = $1))
          AND t.completed_at >= CURRENT_DATE - ($2 || ' days')::interval
       UNION
       SELECT DATE(p.done_at) AS day
         FROM user_task_progress p
         JOIN user_challenges uc ON uc.id = p.user_challenge_id
        WHERE uc.user_id = $1 AND p.is_done
          AND p.done_at >= CURRENT_DATE - ($2 || ' days')::interval
       UNION
       SELECT c.completed_on AS day
         FROM habit_completions c
         JOIN user_habits h ON h.id = c.user_habit_id
        WHERE h.user_id = $1
          AND c.completed_on >= CURRENT_DATE - ($2 || ' days')::interval
     ) AS activity`,
    [userId, ACTIVITY_WINDOW_DAYS]
  );

  return new Set(result.rows.map((row) => row.day));
};

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
  week: {
    start: string;
    days: Array<{ date: string; active: boolean; isToday: boolean }>;
    activeDays: number;
    target: number;
    met: boolean;
  };
}

export const getStreakState = async (userId: string): Promise<StreakState> => {
  const today = todayIso();
  const activity = await loadActivity(userId);
  const covered = await loadCovered(userId);
  const freezes = await ensureFreezes(userId, today);

  const effective = new Set([...activity, ...covered]);
  const freezesLeft = await coverGaps(userId, effective, freezes);

  const runs = buildRuns(effective);
  const yesterday = shift(today, -1);
  const currentRun = runs.find((run) => {
    const last = run[run.length - 1];
    return last === today || last === yesterday;
  });

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
    current: currentRun?.length ?? 0,
    best: runs.reduce((max, run) => Math.max(max, run.length), 0),
    todayDone,
    lastActiveOn: todayDone ? today : (activeList[activeList.length - 1] ?? null),
    freezesAvailable: freezesLeft,
    freezesUsedTotal: Number(used.rows[0]?.total ?? 0),
    week: {
      start: weekStart,
      days: weekDays,
      activeDays,
      target,
      met: activeDays >= target,
    },
  };
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
