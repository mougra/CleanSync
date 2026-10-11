import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import {
  buildDefaultTasks,
  DEFAULT_TASK_SOURCE,
  type DefaultTaskSet,
} from '../services/defaultTasks';
import {
  buildHomePlan,
  CLEANING_LEVELS,
  CLEANING_STYLES,
  COMPOSITIONS,
  DAILY_MINUTES_OPTIONS,
  DEFAULT_HOME_ANSWERS,
  DRYING_OPTIONS,
  HARDEST_ZONES,
  HOUSING_TYPES,
  OUTDOOR_OPTIONS,
  PET_OPTIONS,
  ROOM_OPTIONS,
  withDefaultAnswers,
  type HomePlan,
  type PartialHomeAnswers,
} from '../services/homePlan';

/**
 * Мастер «Настройка по дому»: анкета о доме и ритме уборки + генерация планов.
 *
 * Профиль дома один на пользователя (home_profiles.user_id — первичный ключ),
 * ответы можно сохранять пошагово: PUT принимает и одно поле, и все сразу.
 *
 * По ответам собираются два набора:
 *  - «План по дому» — недельный план (services/homePlan.ts). Пересобирается
 *    целиком при каждом POST /plan, поэтому он всегда отражает анкету;
 *  - «Мои задачи» — постоянный список дел с периодичностью
 *    (services/defaultTasks.ts). Появляется сам, как только анкета пройдена
 *    (PUT с `complete: true`), и дальше живёт своей жизнью: пользователь может
 *    задачи менять и дополнять.
 *
 * Оба набора живут в обычных schedules/tasks, поэтому сразу работают в
 * «Сегодня», статистике и достижениях.
 *
 * Прогресс анкеты. Значения по умолчанию в таблице (миграция 0010) не дают
 * отличить отвеченный шаг от пропущенного, поэтому имена явно присланных полей
 * копятся в `home_profiles.answered_fields` и уходят наружу как `answeredFields`.
 * Это только информация для интерфейса: на генерацию планов список не влияет.
 */
const router = express.Router();

/** Заголовок сгенерированного плана: по нему находим прошлый план при пересборке. */
const PLAN_TITLE = 'План по дому';

interface HomeProfileRow {
  housing_type: string;
  rooms: string;
  composition: string;
  pets: string[] | null;
  outdoor: string;
  has_kids_room: boolean;
  has_garage: boolean;
  works_from_home: boolean;
  drying: string;
  cleaning_level: string;
  daily_minutes: string;
  cleaning_style: string;
  cleaning_days: number[] | null;
  hardest_zone: string;
  /** Имена полей, которые человек заполнил явно (миграция 0015). */
  answered_fields: string[] | null;
  completed_at: string | null;
  updated_at: string | null;
}

/** Колонка → поле ответа и допустимые значения (по вариантам шагов макета). */
const FIELD_RULES: Record<
  keyof PartialHomeAnswers,
  { column: string; values?: readonly string[]; kind: 'string' | 'boolean' | 'intArray' | 'textArray' }
> = {
  housingType: { column: 'housing_type', values: HOUSING_TYPES, kind: 'string' },
  rooms: { column: 'rooms', values: ROOM_OPTIONS, kind: 'string' },
  composition: { column: 'composition', values: COMPOSITIONS, kind: 'string' },
  pets: { column: 'pets', values: PET_OPTIONS, kind: 'textArray' },
  outdoor: { column: 'outdoor', values: OUTDOOR_OPTIONS, kind: 'string' },
  hasKidsRoom: { column: 'has_kids_room', kind: 'boolean' },
  hasGarage: { column: 'has_garage', kind: 'boolean' },
  worksFromHome: { column: 'works_from_home', kind: 'boolean' },
  drying: { column: 'drying', values: DRYING_OPTIONS, kind: 'string' },
  cleaningLevel: { column: 'cleaning_level', values: CLEANING_LEVELS, kind: 'string' },
  dailyMinutes: { column: 'daily_minutes', values: DAILY_MINUTES_OPTIONS, kind: 'string' },
  cleaningStyle: { column: 'cleaning_style', values: CLEANING_STYLES, kind: 'string' },
  cleaningDays: { column: 'cleaning_days', kind: 'intArray' },
  hardestZone: { column: 'hardest_zone', values: HARDEST_ZONES, kind: 'string' },
};

const SELECT_FIELDS = `housing_type, rooms, composition, pets, outdoor, has_kids_room, has_garage,
  works_from_home, drying, cleaning_level, daily_minutes, cleaning_style, cleaning_days,
  hardest_zone, answered_fields, completed_at::text AS completed_at, updated_at::text AS updated_at`;

/** Профиль дома пользователя или null, если анкету ещё не начинали. */
const loadProfile = async (userId: string): Promise<HomeProfileRow | null> => {
  const result = await pool.query<HomeProfileRow>(
    `SELECT ${SELECT_FIELDS} FROM home_profiles WHERE user_id = $1`,
    [userId]
  );

  return result.rows[0] ?? null;
};

/** Имена полей анкеты: по ним же проверяем список явных ответов. */
const ANSWER_FIELD_NAMES: ReadonlySet<string> = new Set(Object.keys(FIELD_RULES));

/**
 * Явно заполненные поля профиля.
 *
 * Список читается из своей же колонки, но наружу отдаются только известные
 * имена: в базе мог оказаться мусор от старого клиента, а интерфейс по этим
 * именам считает шаги мастера, и лишняя строка сломала бы счёт.
 */
const toAnsweredFields = (row: HomeProfileRow | null): string[] =>
  (row?.answered_fields ?? []).filter((field) => ANSWER_FIELD_NAMES.has(field));

/**
 * Ответ интерфейсу: те же ключи, что ждёт мастер, плюс флаг завершённости и
 * список явно заполненных полей.
 *
 * `answeredFields` — это прогресс, а не часть анкеты: значения в `profile`
 * по-прежнему приходят с подставленными умолчаниями (миграция 0010), и
 * отличить «выбрал» от «не трогали» можно только по этому списку.
 */
const toProfileResponse = (row: HomeProfileRow | null) => {
  if (!row) {
    return { profile: null, completed: false, answeredFields: [] as string[] };
  }

  const profile = {
    housingType: row.housing_type,
    rooms: row.rooms,
    composition: row.composition,
    pets: row.pets ?? [],
    outdoor: row.outdoor,
    hasKidsRoom: row.has_kids_room,
    hasGarage: row.has_garage,
    worksFromHome: row.works_from_home,
    drying: row.drying,
    cleaningLevel: row.cleaning_level,
    dailyMinutes: row.daily_minutes,
    cleaningStyle: row.cleaning_style,
    cleaningDays: row.cleaning_days ?? [],
    hardestZone: row.hardest_zone,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };

  return { profile, completed: row.completed_at !== null, answeredFields: toAnsweredFields(row) };
};

/**
 * Разбирает тело запроса: пустой PUT не должен затирать ответы, а явно
 * переданные поля — обновляться, даже если это false или пустой массив.
 */
const parseAnswers = (
  body: unknown
): { answers: PartialHomeAnswers; error?: string; provided: number; reachedEnd: boolean } => {
  const input = (body ?? {}) as Record<string, unknown>;
  const answers: PartialHomeAnswers = {};
  // Мастер присылает complete: true на последнем шаге: только тогда анкета
  // считается пройденной. Без этого флага значения по умолчанию в базе
  // выглядели бы как «человек ответил на всё» уже после первого шага.
  const reachedEnd = input.complete === true;
  let provided = 0;

  for (const key of Object.keys(FIELD_RULES) as (keyof PartialHomeAnswers)[]) {
    if (!(key in input)) continue;

    const value = input[key];
    const rule = FIELD_RULES[key];
    provided += 1;

    if (rule.kind === 'boolean') {
      if (typeof value !== 'boolean') {
        return { answers, error: `Поле «${key}» должно быть true или false`, provided, reachedEnd };
      }
      Object.assign(answers, { [key]: value });
      continue;
    }

    if (rule.kind === 'string') {
      if (typeof value !== 'string' || !rule.values?.includes(value)) {
        return {
          answers,
          error: `Недопустимое значение «${key}»: ${value}. Допустимо: ${rule.values?.join(', ')}`,
          provided,
          reachedEnd,
        };
      }
      Object.assign(answers, { [key]: value });
      continue;
    }

    if (rule.kind === 'textArray') {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        return { answers, error: `Поле «${key}» должно быть массивом строк`, provided, reachedEnd };
      }
      const unknown = value.find((item) => !rule.values?.includes(item as string));
      if (unknown !== undefined) {
        return {
          answers,
          error: `Недопустимое значение «${key}»: ${unknown}. Допустимо: ${rule.values?.join(', ')}`,
          provided,
          reachedEnd,
        };
      }
      Object.assign(answers, { [key]: value as string[] });
      continue;
    }

    // intArray: дни недели 0-6, каждый день не больше одного раза
    if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item))) {
      return { answers, error: `Поле «${key}» должно быть массивом чисел`, provided, reachedEnd };
    }

    const dayNumbers = value as number[];
    if (dayNumbers.some((day) => day < 0 || day > 6)) {
      return { answers, error: `Дни недели — числа от 0 (воскресенье) до 6 (суббота)`, provided, reachedEnd };
    }

    Object.assign(answers, { [key]: [...new Set(dayNumbers)].sort((left, right) => left - right) });
  }

  return { answers, provided, reachedEnd };
};

/** GET /api/home-profile — анкета пользователя, прогресс и null вместо профиля. */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json(toProfileResponse(await loadProfile(String(req.userId))));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch home profile' });
  }
});

/**
 * PUT /api/home-profile — сохранить ответы.
 *
 * Можно частично, шаг за шагом: присылайте только те поля, которые человек
 * успел выбрать. Первое сохранение заводит профиль, дальнейшие обновляют.
 * `completed_at` ставится, когда заполнены все шаги анкеты.
 *
 * Имена пришедших полей добавляются в `answered_fields` — по ним интерфейс
 * считает пройденные шаги мастера. Список только растёт, поэтому повторный
 * проход анкеты (и «Пропустить» на отдельных шагах) не обнуляет прогресс.
 */
router.put('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = parseAnswers(req.body);

    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    if (parsed.provided === 0) {
      res.status(400).json({ error: 'Нужно передать хотя бы одно поле анкеты' });
      return;
    }

    const userId = String(req.userId);
    const current = await loadProfile(userId);
    const merged = { ...DEFAULT_HOME_ANSWERS, ...(current ? toAnswers(current) : {}), ...parsed.answers };

    if (current) {
      const fields = Object.keys(parsed.answers) as (keyof PartialHomeAnswers)[];
      const values = fields.map((field) => parsed.answers[field]);
      const setters = fields.map((field, index) => `${FIELD_RULES[field].column} = $${index + 1}`);

      // Номера оставшихся параметров: список пришедших полей, флаг завершения,
      // user_id. Список полей передаём массивом строк — Postgres сам приведёт
      // его к text[].
      const answeredIndex = values.length + 1;
      const completeIndex = values.length + 2;
      const userIndex = values.length + 3;

      /**
       * `answered_fields` только пополняется: объединение старого массива с
       * пришедшими именами идёт одним UPDATE, поэтому повторный проход анкеты
       * не теряет ранее отвеченные шаги, а два одновременных запроса не
       * затирают друг друга (перечитывать список в JS не нужно).
       */
      await pool.query(
        `UPDATE home_profiles
            SET ${setters.join(', ')},
                answered_fields = (
                  SELECT COALESCE(array_agg(DISTINCT name ORDER BY name), '{}')
                    FROM unnest(answered_fields || $${answeredIndex}::text[]) AS name
                ),
                completed_at = CASE WHEN $${completeIndex} THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
                updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $${userIndex}`,
        [...values, fields, parsed.reachedEnd && isComplete(merged), userId]
      );
    } else {
      const fields = Object.keys(parsed.answers) as (keyof PartialHomeAnswers)[];
      const columns = [
        'user_id',
        ...fields.map((field) => FIELD_RULES[field].column),
        'answered_fields',
        'completed_at',
      ];
      const values: unknown[] = [
        userId,
        ...fields.map((field) => parsed.answers[field]),
        [...fields].sort(),
      ];
      values.push(parsed.reachedEnd && isComplete(merged) ? new Date() : null);

      const placeholders = values.map((_, index) => `$${index + 1}`);

      await pool.query(
        `INSERT INTO home_profiles (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         ON CONFLICT (user_id) DO NOTHING`,
        values
      );
    }

    const updated = await loadProfile(userId);

    /**
     * Анкета пройдена — сразу собираем постоянный набор «Мои задачи», не
     * дожидаясь кнопки «собрать план»: готовый список дел должен появляться
     * сам. Повторные вызовы безопасны: набор идемпотентен, а `removeStale`
     * здесь выключен, чтобы правки пользователя не улетали при каждом шаге.
     */
    if (updated && updated.completed_at) {
      try {
        const defaultSet = buildDefaultTasks(toAnswers(updated));
        const myTasks = await syncDefaultTasks(userId, defaultSet, { removeStale: false });

        res.json({ ...toProfileResponse(updated), myTasks: toMyTasksResponse(myTasks, defaultSet) });
        return;
      } catch (err) {
        // Профиль уже сохранён: неудача сборки набора не должна превращать
        // успешный PUT в 500 — набор достроится при следующем обращении.
        console.error('Не удалось собрать «Мои задачи»:', err);
      }
    }

    res.json(toProfileResponse(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save home profile' });
  }
});

/** Есть ли ответ на каждый из 12 шагов анкеты. */
const isComplete = (answers: PartialHomeAnswers): boolean => {
  const required: (keyof PartialHomeAnswers)[] = [
    'housingType',
    'rooms',
    'composition',
    'pets',
    'outdoor',
    'hasKidsRoom',
    'hasGarage',
    'worksFromHome',
    'drying',
    'cleaningLevel',
    'dailyMinutes',
    'cleaningStyle',
    'cleaningDays',
    'hardestZone',
  ];

  return required.every((field) => {
    const value = answers[field];

    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return true;

    return value !== undefined && value !== null;
  });
};

/** Строка БД → ответы анкеты для генератора. */
const toAnswers = (row: HomeProfileRow): PartialHomeAnswers =>
  withDefaultAnswers({
    housingType: row.housing_type as PartialHomeAnswers['housingType'],
    rooms: row.rooms as PartialHomeAnswers['rooms'],
    composition: row.composition as PartialHomeAnswers['composition'],
    pets: (row.pets ?? []) as PartialHomeAnswers['pets'],
    outdoor: row.outdoor as PartialHomeAnswers['outdoor'],
    hasKidsRoom: row.has_kids_room,
    hasGarage: row.has_garage,
    worksFromHome: row.works_from_home,
    drying: row.drying as PartialHomeAnswers['drying'],
    cleaningLevel: row.cleaning_level as PartialHomeAnswers['cleaningLevel'],
    dailyMinutes: row.daily_minutes as PartialHomeAnswers['dailyMinutes'],
    cleaningStyle: row.cleaning_style as PartialHomeAnswers['cleaningStyle'],
    cleaningDays: row.cleaning_days ?? [],
    hardestZone: row.hardest_zone as PartialHomeAnswers['hardestZone'],
  });

/**
 * Записывает план в обычные schedules/tasks.
 *
 * Идемпотентность: прошлый «План по дому» вместе с задачами удаляется, новое
 * расписание создаётся заново. Так повторный вызов не плодит дубли, а отметки
 * о выполнении старого плана всё равно теряют смысл вместе с самим планом.
 */
const savePlan = async (userId: string, plan: HomePlan) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM tasks
        WHERE schedule_id IN (SELECT id FROM schedules WHERE user_id = $1 AND title = $2)`,
      [userId, PLAN_TITLE]
    );
    await client.query('DELETE FROM schedules WHERE user_id = $1 AND title = $2', [
      userId,
      PLAN_TITLE,
    ]);

    const schedule = await client.query<{ id: number; created_at: string; updated_at: string }>(
      `INSERT INTO schedules (user_id, title, description)
       VALUES ($1, $2, $3)
       RETURNING id, created_at::text AS created_at, updated_at::text AS updated_at`,
      [
        userId,
        PLAN_TITLE,
        `Собрано по настройкам дома: ${plan.summary.totalTasks} задач, ${plan.summary.totalMinutes} минут в неделю`,
      ]
    );

    const scheduleId = schedule.rows[0].id;
    const savedTasks: Array<{
      id: number;
      day_of_week: number;
      title: string;
      room: string;
      estimated_minutes: number;
      position: number;
    }> = [];

    for (const day of plan.days) {
      for (const task of day.tasks) {
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO tasks (schedule_id, title, room, estimated_minutes, frequency, day_of_week)
           VALUES ($1, $2, $3, $4, 'weekly', $5)
           RETURNING id`,
          [scheduleId, task.title, task.room, task.estimatedMinutes, day.dayOfWeek]
        );

        savedTasks.push({
          id: inserted.rows[0].id,
          day_of_week: day.dayOfWeek,
          title: task.title,
          room: task.room,
          estimated_minutes: task.estimatedMinutes,
          position: task.position,
        });
      }
    }

    await client.query('COMMIT');

    return {
      scheduleId,
      createdAt: schedule.rows[0].created_at,
      tasks: savedTasks,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Приводит расписание «Мои задачи» в соответствие с набором по анкете.
 *
 * Идемпотентность устроена так:
 *  - расписание ищется по заголовку и создаётся только если его нет;
 *  - уже существующие задачи с тем же названием не трогаются вообще — человек
 *    мог поменять им минуты, день или периодичность, и перезапись это стёрла бы;
 *  - добавляются только недостающие названия, поэтому повторный вызов не плодит
 *    дубли (ключ — название задачи внутри расписания);
 *  - с `removeStale` (это явная пересборка через POST /plan) убираются только
 *    устаревшие задачи, которые создал этот же набор (`source`), и только
 *    незакрытые: выполненная история и задачи, созданные руками, остаются.
 */
const syncDefaultTasks = async (
  userId: string,
  set: DefaultTaskSet,
  options: { removeStale: boolean }
): Promise<{ scheduleId: number; created: number; existing: number; removed: number; total: number }> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Два одновременных вызова (двойной клик по «пересобрать») иначе могли бы
    // создать два расписания «Мои задачи»: блокировка живёт до конца транзакции.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), $2::int)', [
      set.scheduleTitle,
      userId,
    ]);

    const existingSchedule = await client.query<{ id: number }>(
      'SELECT id FROM schedules WHERE user_id = $1 AND title = $2 ORDER BY id LIMIT 1',
      [userId, set.scheduleTitle]
    );

    let scheduleId = existingSchedule.rows[0]?.id;

    if (scheduleId === undefined) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO schedules (user_id, title, description)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [
          userId,
          set.scheduleTitle,
          `Постоянные дела по настройкам дома: ${set.summary.totalTasks} задач, до ${set.summary.maxDailyMinutes} минут в день`,
        ]
      );

      scheduleId = inserted.rows[0].id;
    }

    const current = await client.query<{
      id: number;
      title: string;
      is_completed: boolean;
      source: string | null;
    }>('SELECT id, title, is_completed, source FROM tasks WHERE schedule_id = $1', [scheduleId]);

    const byTitle = new Map(current.rows.map((row) => [row.title, row]));
    const wanted = new Set(set.tasks.map((task) => task.title));

    let created = 0;
    let existing = 0;

    for (const task of set.tasks) {
      if (byTitle.has(task.title)) {
        existing += 1;
        continue;
      }

      await client.query(
        `INSERT INTO tasks
           (schedule_id, title, room, estimated_minutes, frequency, interval_count,
            day_of_week, day_of_month, due_date, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          scheduleId,
          task.title,
          task.room,
          task.minutes,
          task.frequency,
          task.intervalCount,
          task.dayOfWeek,
          task.dayOfMonth,
          task.dueDate,
          task.source,
        ]
      );

      created += 1;
    }

    let removed = 0;

    if (options.removeStale) {
      const stale = current.rows.filter(
        (row) => row.source === DEFAULT_TASK_SOURCE && !row.is_completed && !wanted.has(row.title)
      );

      if (stale.length > 0) {
        await client.query('DELETE FROM tasks WHERE id = ANY($1::int[])', [
          stale.map((row) => row.id),
        ]);
        removed = stale.length;
      }
    }

    const total = await client.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM tasks WHERE schedule_id = $1',
      [scheduleId]
    );

    await client.query('COMMIT');

    return { scheduleId, created, existing, removed, total: total.rows[0].total };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** Ответ по постоянному набору: что записалось и как он выглядит по нагрузке. */
const toMyTasksResponse = (
  saved: { scheduleId: number; created: number; existing: number; removed: number; total: number },
  set: DefaultTaskSet
) => ({
  ...saved,
  title: set.scheduleTitle,
  dailyMinutes: set.summary.dailyMinutes,
  weeklyTasks: set.summary.weeklyTasks,
  monthlyTasks: set.summary.monthlyTasks,
  maxDailyMinutes: set.summary.maxDailyMinutes,
  notes: set.summary.notes,
});

/**
 * POST /api/home-profile/plan — собрать планы по сохранённым ответам.
 *
 * Повторный вызов заменяет недельный «План по дому» и достраивает «Мои задачи»
 * (недостающие дела добавляются, устаревшие незакрытые — убираются), поэтому
 * кнопку «пересобрать» можно нажимать сколько угодно раз: дублей не будет.
 */
router.post('/plan', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = String(req.userId);
    const row = await loadProfile(userId);

    if (!row) {
      res.status(400).json({ error: 'Сначала заполните анкету о доме' });
      return;
    }

    const plan = buildHomePlan(toAnswers(row));
    const saved = await savePlan(userId, plan);

    // Постоянный набор «Мои задачи» собирается из тех же ответов, но пишется
    // идемпотентно: повторный вызов не создаёт второй раз те же дела.
    const defaultSet = buildDefaultTasks(toAnswers(row));
    const myTasks = await syncDefaultTasks(userId, defaultSet, { removeStale: true });

    // Задачам присваиваем настоящие id: интерфейс сразу может их отмечать
    // тем же PUT /api/tasks/:id, что и любую другую задачу.
    let cursor = 0;
    const days = plan.days.map((day) => ({
      ...day,
      tasks: day.tasks.map((task) => {
        const savedTask = saved.tasks[cursor];
        cursor += 1;

        return {
          ...task,
          id: savedTask?.id ?? null,
          frequency: 'weekly',
          dayOfWeek: day.dayOfWeek,
        };
      }),
    }));

    res.json({
      schedule: {
        id: saved.scheduleId,
        title: plan.title,
        createdAt: saved.createdAt,
      },
      level: plan.level,
      focusZone: plan.focusZone,
      days,
      summary: plan.summary,
      generatedFor: toAnswers(row),
      myTasks: toMyTasksResponse(myTasks, defaultSet),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate home plan' });
  }
});

/**
 * GET /api/home-profile/plan — посмотреть план по сохранённым ответам.
 *
 * Ничего не перезаписывает: недельный план считается заново (он идемпотентен),
 * а постоянный набор «Мои задачи» только достраивается, если пользователь
 * завёл анкету до появления этой функции. Так «первое обращение к плану» тоже
 * даёт человеку готовый список дел.
 */
router.get('/plan', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = String(req.userId);
    const row = await loadProfile(userId);

    if (!row) {
      res.status(400).json({ error: 'Сначала заполните анкету о доме' });
      return;
    }

    const plan = buildHomePlan(toAnswers(row));
    const stored = await pool.query<{ id: number; created_at: string }>(
      `SELECT id, created_at::text AS created_at FROM schedules WHERE user_id = $1 AND title = $2 ORDER BY id LIMIT 1`,
      [userId, PLAN_TITLE]
    );

    const defaultSet = buildDefaultTasks(toAnswers(row));
    const myTasks = await syncDefaultTasks(userId, defaultSet, { removeStale: false });

    res.json({
      schedule: stored.rows[0]
        ? { id: stored.rows[0].id, title: PLAN_TITLE, createdAt: stored.rows[0].created_at }
        : null,
      level: plan.level,
      focusZone: plan.focusZone,
      days: plan.days,
      summary: plan.summary,
      generatedFor: toAnswers(row),
      myTasks: toMyTasksResponse(myTasks, defaultSet),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch home plan' });
  }
});

/** DELETE /api/home-profile — сбросить анкету и собранный по ней недельный план. */
router.delete('/', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  const userId = String(req.userId);

  try {
    await client.query('BEGIN');

    const deletedSchedule = await client.query<{ id: number }>(
      `DELETE FROM schedules WHERE user_id = $1 AND title = $2 RETURNING id`,
      [userId, PLAN_TITLE]
    );
    const deletedProfile = await client.query(
      'DELETE FROM home_profiles WHERE user_id = $1 RETURNING user_id',
      [userId]
    );

    await client.query('COMMIT');

    res.json({
      profileReset: (deletedProfile.rowCount ?? 0) > 0,
      planDeleted: (deletedSchedule.rowCount ?? 0) > 0,
      // «Мои задачи» намеренно остаются: это уже рабочий список человека,
      // который он мог дополнить и поправить, — сброс анкеты его не касается.
      profile: null,
      completed: false,
      // Список явных ответов живёт в той же строке, поэтому уходит вместе с ней.
      answeredFields: [],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to reset home profile' });
  } finally {
    client.release();
  }
});

export default router;
