import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { checkAndAwardAchievements } from '../services/achievementManager';
import { canAccessSchedule } from '../services/household';
import { DEFAULT_TASK_SOURCE, normalizeTaskTitle } from '../services/defaultTasks';
import { HOME_PLAN_SOURCE } from '../services/homePlan';

const router = express.Router();

/**
 * Пометки источников, которые считаются сгенерированными сервером.
 *
 * `home_profile_defaults` — постоянный набор «Мои задачи», `home_plan` — задачи
 * прежнего недельного плана (расписание больше не создаётся, но старые строки
 * ещё живут до переноса). Только эти задачи попадают в память об отказах: своё
 * человек удаляет без следа, потому что его никто и не воскрешал бы.
 */
const GENERATED_TASK_SOURCES: readonly string[] = [DEFAULT_TASK_SOURCE, HOME_PLAN_SOURCE];

// Get checklists for a task
router.get('/:id/checklists', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify task ownership
    const taskResult = await pool.query('SELECT schedule_id FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const scheduleResult = await pool.query('SELECT user_id FROM schedules WHERE id = $1', [taskResult.rows[0].schedule_id]);
    if (String(scheduleResult.rows[0].user_id) !== String(req.userId)) return res.status(403).json({ error: 'Forbidden' });

    const result = await pool.query('SELECT * FROM task_checklists WHERE task_id = $1', [id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch checklists' });
  }
});

/**
 * Повторяющиеся дела: у них результат считается по дню, а не по задаче.
 *
 * `once` (и любая другая частота, включая NULL) — разовое дело: сделанное
 * однажды, оно остаётся сделанным, потому что второго дня у него нет.
 */
const RECURRING_FREQUENCIES: readonly string[] = ['daily', 'weekly', 'monthly'];

/** Сегодняшний день в UTC — тот же, которым считает `tasksDueOn`. */
const todayIso = (): string => new Date().toISOString().slice(0, 10);

/**
 * День отметки (UTC) по отметке времени: `2025-10-05T21:00:00.000Z` → `2025-10-05`.
 *
 * Нужен возврату удалённой задачи (`POST /api/tasks/restore`): там отметка дня
 * восстанавливается по прежнему `completed_at`, а не ставится на сегодня.
 * Неразобранная дата сводится к сегодняшней — выдумывать день нельзя.
 */
const isoDayOf = (timestamp: string): string => {
  const parsed = new Date(timestamp);

  return Number.isNaN(parsed.getTime()) ? todayIso() : parsed.toISOString().slice(0, 10);
};

/**
 * Задачи, попадающие на конкретный день.
 *
 * Условия периодичности живут в одном месте: «План на сегодня» и список
 * ближайших дней обязаны считать одинаково, иначе недельная задача появится в
 * одном месте и исчезнет в другом. Дата — в UTC, как было и раньше.
 *
 * Про интервал: при `interval_count = 1` всё как раньше (задача дня/недели/
 * месяца), при большем цикл считается от `due_date` — даты первой постановки,
 * поэтому «раз в 3 месяца» не всплывает каждый месяц.
 *
 * Про результат дня. `is_completed` в ответе — это результат **на запрошенный
 * день**, а не текущий флаг задачи (миграция 0018, таблица `task_completions`):
 *  - повторяющееся дело (daily/weekly/monthly) закрыто, только если на этот день
 *    есть отметка. Вчерашняя галочка не переезжает на завтра;
 *  - разовое дело (once/due_date) закрыто, если отметка есть на его дату или
 *    стоит прежний флаг `tasks.is_completed`: сделанное однажды остаётся
 *    сделанным, второго дня у такого дела нет.
 * Правило целиком живёт в SQL (колонка `completed_for_day`), а не размазано по
 * вызывающим: «Сегодня» и календарь читают один и тот же признак.
 */
const tasksDueOn = async (userId: string, date: Date) => {
  const dayOfWeek = date.getUTCDay(); // 0-6, 0 — воскресенье
  const dayOfMonth = date.getUTCDate(); // 1-31
  const dayStr = date.toISOString().split('T')[0];

  const result = await pool.query(
    `SELECT t.*, s.title as schedule_title,
            CASE
              -- Повторяющееся дело: результат строго на этот день.
              -- COALESCE: у задачи без частоты (NULL) условие дало бы NULL, и
              -- разбор молча ушёл бы в ветку ELSE — лучше сказать это явно.
              WHEN COALESCE(t.frequency, '') = ANY($5::text[])
                THEN EXISTS (SELECT 1 FROM task_completions c
                              WHERE c.task_id = t.id AND c.completed_on = $4::date)
              -- Разовое: отметка на его дату или прежний флаг задачи.
              ELSE t.is_completed
                   OR EXISTS (SELECT 1 FROM task_completions c
                               WHERE c.task_id = t.id AND c.completed_on = t.due_date)
            END AS completed_for_day
     FROM tasks t
     JOIN schedules s ON t.schedule_id = s.id
     WHERE (
             s.user_id = $1
             -- Общий план дома: задачи мои или ничейные, чужие не показываем
             OR (s.household_id IS NOT NULL
                 AND s.household_id IN (SELECT household_id FROM household_members WHERE user_id = $1)
                 AND (t.assignee_id IS NULL OR t.assignee_id = $1))
           )
       AND (
         -- Периодичность «раз в N дней/недель/месяцев» (interval_count).
         -- При interval_count = 1 всё как раньше: задача дня/недели/месяца.
         -- При большем интервале цикл считается от due_date — даты первой
         -- постановки, поэтому «раз в 3 месяца» не всплывает каждый месяц.
         (t.frequency = 'daily' AND t.interval_count <= 1) OR
         (t.frequency = 'daily' AND t.due_date IS NOT NULL
           AND MOD(($4::date - t.due_date), t.interval_count) = 0) OR
         (t.frequency = 'weekly' AND t.day_of_week = $2 AND t.interval_count <= 1) OR
         (t.frequency = 'weekly' AND t.day_of_week = $2 AND t.due_date IS NOT NULL
           AND MOD(FLOOR(($4::date - t.due_date)::numeric / 7)::int, t.interval_count) = 0) OR
         (t.frequency = 'monthly' AND t.day_of_month = $3 AND t.interval_count <= 1) OR
         (t.frequency = 'monthly' AND t.day_of_month = $3 AND t.due_date IS NOT NULL
           AND MOD(
                 MOD(
                   (EXTRACT(YEAR FROM $4::date) * 12 + EXTRACT(MONTH FROM $4::date))
                   - (EXTRACT(YEAR FROM t.due_date) * 12 + EXTRACT(MONTH FROM t.due_date)),
                   t.interval_count
                 ) + t.interval_count,
                 t.interval_count
               ) = 0) OR
         (t.due_date = $4)
       )
     -- При равном или пустом времени Postgres не обещает порядок, и строки
     -- переставлялись после каждой отметки: идентификатор — устойчивый добор.
     ORDER BY t.time ASC NULLS LAST, t.id ASC`,
    [userId, dayOfWeek, dayOfMonth, dayStr, RECURRING_FREQUENCIES]
  );

  /**
   * Наружу уходит `is_completed` на запрошенный день, а служебная колонка
   * `completed_for_day` — нет: форма ответа «Сегодня» и календаря остаётся
   * прежней, меняется только смысл признака.
   */
  return result.rows.map(({ completed_for_day, ...task }) => ({
    ...task,
    is_completed: completed_for_day === true,
  }));
};

// Get today's tasks
router.get('/today', authMiddleware, async (req: Request, res: Response) => {

  try {
    const tasks = await tasksDueOn(req.userId as string, new Date());
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.is_completed).length;
    const totalMinutes = tasks.reduce((acc, t) => acc + (t.estimated_minutes || 0), 0);
    const remainingMinutes = tasks.filter(t => !t.is_completed).reduce((acc, t) => acc + (t.estimated_minutes || 0), 0);

    // Group tasks by room
    const groupedTasks: { [key: string]: any[] } = {};
    for (const task of tasks) {
      const room = task.room || 'General';
      if (!groupedTasks[room]) groupedTasks[room] = [];
      groupedTasks[room].push(task);
    }

    res.json({
      summary: {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        progress: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
        total_estimated_time: totalMinutes,
        remaining_time: remainingMinutes
      },
      tasks: groupedTasks
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch today\'s tasks' });
  }
});

/**
 * Задачи на ближайшие дни (по умолчанию три, максимум 14).
 *
 * Нужно, чтобы «план на каждый день» было видно, а не подразумевалось: недельная
 * задача появится в свой день, «раз в 3 месяца» — только через три месяца. Считаем
 * тем же помощником, что и «сегодня», поэтому правила совпадают по определению.
 */
router.get('/upcoming', authMiddleware, async (req: Request, res: Response) => {
  try {
    const requested = Number.parseInt(String(req.query.days ?? '3'), 10);
    const days = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 14) : 3;

    const userId = req.userId as string;
    const start = new Date();

    const result = [];

    for (let offset = 1; offset <= days; offset += 1) {
      const date = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);
      const tasks = await tasksDueOn(userId, date);

      result.push({
        date: date.toISOString().split('T')[0],
        weekday: date.getUTCDay(),
        total_tasks: tasks.length,
        total_minutes: tasks.reduce((sum, task) => sum + (task.estimated_minutes || 0), 0),
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          room: task.room,
          estimated_minutes: task.estimated_minutes,
          frequency: task.frequency,
          interval_count: task.interval_count,
          schedule_title: task.schedule_title,
        })),
      });
    }

    res.json({ days: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch upcoming tasks' });
  }
});

/** Дата в формате YYYY-MM-DD — ровно то, что приходит в query и уходит в ответ. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Разбирает дату из query и проверяет, что она настоящая.
 *
 * `new Date('2025-02-31')` молча переезжает на 3 марта, поэтому календарную дату
 * сверяем с её же отпечатком: разошлись — значит такой даты не существует.
 */
const parseCalendarDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return date;
};

/** Сколько дней помещается в один запрос календаря: шесть недель — больше не нужно. */
const CALENDAR_MAX_DAYS = 42;

/** Длительность суток: диапазон календаря шагаем ровно на сутки, без часовых переходов. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Задачи по дням для календаря: `GET /api/tasks/calendar?from=…&to=…`.
 *
 * Правила периодичности не дублируются — каждый день считает тот же
 * `tasksDueOn`, что и «План на сегодня»: недельная задача и «раз в 3 месяца»
 * попадают ровно в свои дни, и расхождению между экранами взяться неоткуда.
 *
 * Даты трактуются как календарные (UTC-полночь), чтобы день в ответе совпадал с
 * днём в запросе независимо от часового пояса сервера.
 */
router.get('/calendar', authMiddleware, async (req: Request, res: Response) => {
  try {
    const from = parseCalendarDate(req.query.from);
    const to = parseCalendarDate(req.query.to);

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to must be valid dates in YYYY-MM-DD format' });
    }

    if (from.getTime() > to.getTime()) {
      return res.status(400).json({ error: 'from must not be later than to' });
    }

    const span = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;

    // Диапазон шире шести недель не обслуживаем осознанно: это ошибка клиента,
    // а не тихая обрезка, иначе интерфейс молча получил бы не те дни.
    if (span > CALENDAR_MAX_DAYS) {
      return res.status(400).json({
        error: `Range is too wide: at most ${CALENDAR_MAX_DAYS} days per request`,
        max_days: CALENDAR_MAX_DAYS,
      });
    }

    const userId = req.userId as string;
    const days = [];

    for (let offset = 0; offset < span; offset += 1) {
      const date = new Date(from.getTime() + offset * DAY_MS);
      const tasks = await tasksDueOn(userId, date);
      const iso = date.toISOString().slice(0, 10);

      // Итоги дня считает сервер: шторка дня показывает по ним сводку
      // («запланировано 5 · закрыто 2 · факт 25 мин»), и числа обязаны совпадать
      // с планом на сегодня, а не пересчитываться в интерфейсе по-своему.
      const completed = tasks.filter((task) => task.is_completed);

      days.push({
        date: iso,
        weekday: date.getUTCDay(),
        total_tasks: tasks.length,
        completed_tasks: completed.length,
        total_minutes: tasks.reduce((sum, task) => sum + (task.estimated_minutes || 0), 0),
        completed_minutes: completed.reduce((sum, task) => sum + (task.estimated_minutes || 0), 0),
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          room: task.room,
          estimated_minutes: task.estimated_minutes,
          is_completed: task.is_completed,
          frequency: task.frequency,
          interval_count: task.interval_count,
        })),
      });
    }

    res.json({
      from: from.toISOString().slice(0, 10),
      to: new Date(from.getTime() + (span - 1) * DAY_MS).toISOString().slice(0, 10),
      days,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch calendar tasks' });
  }
});

// Create task
router.post('/', authMiddleware, async (req: Request, res: Response) => {

  try {
    const { schedule_id, title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room, interval_count } = req.body;

    if (!schedule_id || !title) {
      return res.status(400).json({ error: 'schedule_id and title required' });
    }

    // Check ownership
    const scheduleResult = await pool.query(
      'SELECT user_id FROM schedules WHERE id = $1',
      [schedule_id]
    );

    if (scheduleResult.rows.length === 0 || String(scheduleResult.rows[0].user_id) !== String(req.userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // «Раз в N дней/недель/месяцев»: интервал меньше единицы не имеет смысла,
    // поэтому всё, что не положительное целое, сводится к «раз в 1».
    const interval = Number.isInteger(interval_count) && interval_count > 0 ? interval_count : 1;

    // `??`, а не `||`: ноль здесь законное значение. `day_of_week = 0` — это
    // воскресенье, и с `||` повтор на воскресенье сохранялся как «без дня».
    const result = await pool.query(
      'INSERT INTO tasks (schedule_id, title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room, interval_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, title, frequency, interval_count, day_of_week, day_of_month, due_date, time, estimated_minutes, room, is_completed, created_at',
      [schedule_id, title, frequency ?? null, day_of_week ?? null, day_of_month ?? null, due_date ?? null, time ?? null, estimated_minutes ?? 0, room ?? null, interval]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * Отметка задачи на сегодня и снятие отметки: `PUT /api/tasks/:id`.
 *
 * Отметка — это результат **дня**, а не задачи. Поэтому одной транзакцией
 * делаются две вещи:
 *  1. отметка в журнале `task_completions` на сегодняшнюю дату в UTC — тем же
 *     днём считает выборка «Сегодня» (`tasksDueOn`), поэтому галочка сегодня не
 *     видна вчера и завтра; при снятии удаляется отметка ровно сегодняшнего дня,
 *     прежние дни остаются со своим результатом;
 *  2. прежние колонки задачи (`is_completed`, `completed_at`, `completed_by`) —
 *     они продолжают обновляться ровно как раньше. На них держатся серия
 *     (services/streak.ts), достижения (services/achievementManager.ts),
 *     статистика (routes/analytics.ts) и семейный режим (routes/household.ts):
 *     эти модули читают последнюю отметку задачи, и эта задача их не переписывает
 *     (перевод на журнал — следующий шаг).
 *
 * Две записи в одной транзакции нужны, чтобы не было состояния «флаг стоит, а
 * отметки нет»: по такой паре задача выглядела бы закрытой в статистике дома и
 * открытой в календаре.
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room, is_completed, interval_count } = req.body;

    // Check ownership via schedule
    const taskResult = await pool.query(
      'SELECT schedule_id FROM tasks WHERE id = $1',
      [id]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Доступ: своё расписание или общий план дома, в котором я состою
    const access = await canAccessSchedule(String(req.userId), taskResult.rows[0].schedule_id);

    if (!access.allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    /** Сегодняшний день в UTC: отметка ставится именно на него. */
    const completedOn = todayIso();

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        frequency = COALESCE($2, frequency),
        day_of_week = COALESCE($3, day_of_week),
        day_of_month = COALESCE($4, day_of_month),
        due_date = COALESCE($5, due_date),
        time = COALESCE($6, time),
        estimated_minutes = COALESCE($7, estimated_minutes),
        room = COALESCE($8, room),
        -- Интервал периодичности: принимаем только положительное целое
        interval_count = COALESCE($12::int, interval_count),
        is_completed = COALESCE($9, is_completed),
        completed_at = CASE
          WHEN COALESCE($9, is_completed) = TRUE THEN CURRENT_TIMESTAMP
          ELSE NULL
        END,
        -- Кто именно закрыл: нужно для личной серии и статистики дома.
        -- Приведение к int обязательно: из JWT идентификатор приходит строкой.
        completed_by = CASE
          WHEN COALESCE($9, is_completed) = TRUE THEN $11::int
          ELSE NULL
        END
      WHERE id = $10
      RETURNING id, title, frequency, interval_count, day_of_week, day_of_month, due_date, time, estimated_minutes, room, is_completed, completed_at, created_at, assignee_id, completed_by`,
      [title ?? null, frequency ?? null, day_of_week ?? null, day_of_month ?? null, due_date ?? null, time ?? null, estimated_minutes ?? null, room ?? null, is_completed !== undefined ? is_completed : null, id, req.userId, Number.isInteger(interval_count) && interval_count > 0 ? interval_count : null]
    );

    const taskId = result.rows[0]?.id;

    /**
     * Журнал дня. `ON CONFLICT` делает повторную отметку идемпотентной и
     * обновляет автора: дело, закрытое утром одним участником дома и вечером
     * другим, остаётся одной строкой журнала.
     *
     * Запрос выполняется, только если в теле был `is_completed`: PUT без него
     * (правка названия, времени и т.п.) результат дня не трогает.
     */
    if (taskId !== undefined && is_completed === true) {
      await client.query(
        `INSERT INTO task_completions (task_id, completed_on, completed_by, completed_at)
         VALUES ($1::int, $2::date, $3::int, CURRENT_TIMESTAMP)
         ON CONFLICT (task_id, completed_on)
         DO UPDATE SET completed_by = EXCLUDED.completed_by,
                       completed_at = EXCLUDED.completed_at`,
        [taskId, completedOn, req.userId]
      );
    }

    if (taskId !== undefined && is_completed === false) {
      await client.query(
        'DELETE FROM task_completions WHERE task_id = $1::int AND completed_on = $2::date',
        [taskId, completedOn]
      );
    }

    await client.query('COMMIT');

    // Award achievements if task was completed
    let awarded: string[] = [];
    if (result.rows[0] && result.rows[0].is_completed) {
      awarded = await checkAndAwardAchievements(req.userId!);
    }

    res.json({ ...result.rows[0], awarded });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  } finally {
    client.release();
  }
});

/**
 * Набор колонок задачи, который уходит наружу при удалении и восстановлении.
 *
 * Нужен клиенту, чтобы показать «Вернуть» и отдать ровно то же тело в
 * `POST /api/tasks/restore`: интерфейс не запрашивает задачу отдельно и не
 * додумывает поля, а держит в руках её копию. `id` в списке обязателен: без него
 * у возвращённой задачи нет адреса, и её нельзя ни отметить, ни удалить снова.
 * Назначение (`assignee_id`) сюда не входит: возврат чужим назначением не
 * занимается, и роль проверяется по строке, прочитанной до удаления отдельно.
 * Порядок колонок — как в ответах `POST /api/tasks` и `PUT /api/tasks/:id`.
 */
const TASK_PAYLOAD_COLUMNS = `id, schedule_id, title, room, frequency, interval_count,
  day_of_week, day_of_month, due_date, time, estimated_minutes, source, is_completed,
  completed_at`;

/** Строка задачи в объёме полей возврата: `time` уходит строкой `HH:MM:SS`. */
interface TaskPayloadRow {
  id: number;
  schedule_id: number;
  title: string;
  room: string | null;
  frequency: string | null;
  interval_count: number;
  day_of_week: number | null;
  day_of_month: number | null;
  due_date: string | null;
  time: string | null;
  estimated_minutes: number | null;
  source: string | null;
  is_completed: boolean;
  completed_at: string | null;
}

/**
 * Удалить задачу.
 *
 * Свою — можно всегда. В общем плане дома участник удаляет только свою или
 * ничейную задачу, владелец — любую. Отдельного DELETE раньше не было вовсе,
 * поэтому кнопка удаления пункта в чек-листе упиралась в 404.
 *
 * Память об отказах. Если задача сгенерированная (`source` из
 * GENERATED_TASK_SOURCES), её название запоминается в `dismissed_default_tasks`
 * (миграция 0017): набор «Мои задачи» пересобирается идемпотентно по названиям, и
 * без этой пометки удалённое дело возвращалось бы при следующей пересборке или
 * повторном прохождении анкеты. Свою задачу человек удаляет без следа в списке
 * отказов — её никто и не создавал заново.
 *
 * Ответ отдаёт и саму удалённую задачу полем `task`: пока показывается
 * уведомление с кнопкой «Вернуть», клиент держит её копию и отправляет обратно в
 * `POST /api/tasks/restore`. Прежние поля (`deleted`, `id`, `dismissed`) остаются
 * на месте — форма ответа только дополнена.
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    /**
     * Всё, что нужно и для проверки прав, и для ответа: задача читается один раз
     * до удаления, потому что после DELETE восстанавливать её поля неоткуда.
     * `assignee_id` берём из строки только для проверки роли и в ответ не
     * переносим: возврат задачи чужим назначением не занимается, и клиенту это
     * поле не нужно (форма ответа зафиксирована тестом).
     */
    const taskResult = await client.query<TaskPayloadRow & { assignee_id: number | null }>(
      `SELECT ${TASK_PAYLOAD_COLUMNS}, assignee_id FROM tasks WHERE id = $1`,
      [id]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];
    const access = await canAccessSchedule(String(req.userId), task.schedule_id);

    if (!access.allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (access.householdId !== null && task.assignee_id !== null && String(task.assignee_id) !== String(req.userId)) {
      // Роль смотрим в том же доме, к которому относится задача: владельцем
      // человек может быть в одном доме и участником в другом.
      if (access.role !== 'owner') {
        return res.status(403).json({ error: 'This task is assigned to another member' });
      }
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM tasks WHERE id = $1', [id]);

    const generated = task.source !== null && GENERATED_TASK_SOURCES.includes(task.source);
    let dismissed = false;

    if (generated) {
      // ON CONFLICT: повторное удаление того же названия ничего не меняет —
      // идемпотентность важна и здесь, набор пересобирается часто.
      await client.query(
        `INSERT INTO dismissed_default_tasks (user_id, title)
         VALUES ($1, $2)
         ON CONFLICT (user_id, title) DO NOTHING`,
        [req.userId, normalizeTaskTitle(task.title)]
      );
      dismissed = true;
    }

    await client.query('COMMIT');

    // Копия задачи для кнопки «Вернуть»: поля перечислены поимённо, чтобы
    // служебное `assignee_id` в тело не просочилось.
    const payload: TaskPayloadRow = {
      id: task.id,
      schedule_id: task.schedule_id,
      title: task.title,
      room: task.room,
      frequency: task.frequency,
      interval_count: task.interval_count,
      day_of_week: task.day_of_week,
      day_of_month: task.day_of_month,
      due_date: task.due_date,
      time: task.time,
      estimated_minutes: task.estimated_minutes,
      source: task.source,
      is_completed: task.is_completed,
      completed_at: task.completed_at,
    };

    res.json({ deleted: true, id: Number(id), dismissed, task: payload });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  } finally {
    client.release();
  }
});

/** Необязательные поля задачи при восстановлении: приходят из ответа удаления. */
interface RestoreBody {
  schedule_id?: unknown;
  title?: unknown;
  room?: unknown;
  frequency?: unknown;
  interval_count?: unknown;
  day_of_week?: unknown;
  day_of_month?: unknown;
  due_date?: unknown;
  time?: unknown;
  estimated_minutes?: unknown;
  source?: unknown;
  is_completed?: unknown;
  completed_at?: unknown;
}

/** Целое из тела запроса или null: `0` (воскресенье, нулевой день месяца) — значение. */
const restoreInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

/** Строка из тела запроса или null: пустая строка значением не считается. */
const restoreText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/**
 * Восстановить удалённую задачу: `POST /api/tasks/restore`.
 *
 * Задача возвращается в то же расписание и с теми же полями — тело запроса
 * приходит из ответа `DELETE /api/tasks/:id` (`task`), поэтому клиенту не нужно
 * ничего досочинять. Права проверяются ровно теми же правилами, что и удаление:
 * доступ к расписанию (`canAccessSchedule`) и роль владельца, если задача в общем
 * плане дома назначена другому участнику. Иначе «Вернуть» обходило бы запрет на
 * удаление чужого назначения.
 *
 * Отказ снимается. Удаление сгенерированной задачи оставляет её название в
 * `dismissed_default_tasks` (миграция 0017), и без этой чистки возвращённая задача
 * снова пропала бы при следующей пересборке набора: строка «отказа» пережила бы
 * своё действие. Поэтому при восстановлении такой задачи запись удаляется, а
 * наружу уходит `restoredFromDismissal` — по нему видно, что отказ снят.
 */
router.post('/restore', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const body = (req.body ?? {}) as RestoreBody;
    const scheduleId = restoreInt(body.schedule_id);
    const title = restoreText(body.title);

    if (scheduleId === null || title === null) {
      return res.status(400).json({ error: 'schedule_id and title required' });
    }

    // Расписание могло исчезнуть, пока уведомление висело на экране: тогда
    // восстанавливать некуда, и это 404, а не молчаливая вставка в никуда.
    const schedule = await client.query<{ id: number }>(
      'SELECT id FROM schedules WHERE id = $1',
      [scheduleId]
    );

    if (schedule.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const access = await canAccessSchedule(String(req.userId), scheduleId);

    if (!access.allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const source = restoreText(body.source);

    /**
     * Интервал меньше единицы невозможен (CHECK в миграции 0012): у старых задач
     * и у мусора в теле он сводится к «раз в 1», как и при создании.
     */
    const intervalCount = restoreInt(body.interval_count);
    const interval = intervalCount !== null && intervalCount > 0 ? intervalCount : 1;

    const isCompleted = body.is_completed === true;

    /**
     * `completed_by` не приходит в теле удаления, но закрытая задача без автора
     * не попала бы в личную серию и статистику дома. Тот, кто вернул задачу,
     * и закрыл её — так же считает `PUT /api/tasks/:id`.
     */
    const completedAt =
      isCompleted && typeof body.completed_at === 'string' && body.completed_at.trim() !== ''
        ? body.completed_at
        : isCompleted
          ? new Date().toISOString()
          : null;

    await client.query('BEGIN');

    const inserted = await client.query<TaskPayloadRow>(
      `INSERT INTO tasks
         (schedule_id, title, room, frequency, interval_count, day_of_week, day_of_month,
          due_date, time, estimated_minutes, source, is_completed, completed_at, completed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${TASK_PAYLOAD_COLUMNS}`,
      [
        scheduleId,
        title,
        restoreText(body.room),
        restoreText(body.frequency),
        interval,
        restoreInt(body.day_of_week),
        restoreInt(body.day_of_month),
        restoreText(body.due_date),
        restoreText(body.time),
        restoreInt(body.estimated_minutes) ?? 0,
        source,
        isCompleted,
        completedAt,
        // Приведение к int обязательно: из JWT идентификатор приходит строкой
        // (правило 25), и в CASE ... THEN $n вывод ушёл бы в text.
        isCompleted ? req.userId : null,
      ]
    );

    /**
     * Снятие отказа: название ищем нормализованным — ровно тем же ключом, что и
     * сборка набора (`syncDefaultTasks`), иначе запись осталась бы «висеть».
     */
    const generated = source !== null && GENERATED_TASK_SOURCES.includes(source);
    const dismissedTitle = normalizeTaskTitle(title);
    let restoredFromDismissal = false;

    if (generated) {
      const cleared = await client.query(
        'DELETE FROM dismissed_default_tasks WHERE user_id = $1 AND title = $2 RETURNING title',
        [req.userId, dismissedTitle]
      );
      restoredFromDismissal = (cleared.rowCount ?? 0) > 0;
    }

    /**
     * Отметка дня для возвращённой закрытой задачи.
     *
     * Удаление задачи уносит её отметки каскадом (`ON DELETE CASCADE`), поэтому
     * без этой вставки повторяющееся дело после «Вернуть» снова выглядело бы
     * незакрытым в тот день, когда его закрыли: результат дня считается по
     * журналу, а журнал вместе с задачей и пропал. День берётся из `completed_at`
     * (или сегодняшний, если дата не разобралась), автор — тот, кто вернул задачу:
     * так же считает `PUT /api/tasks/:id`.
     */
    if (isCompleted) {
      const completedOn = completedAt === null ? todayIso() : isoDayOf(completedAt);

      await client.query(
        `INSERT INTO task_completions (task_id, completed_on, completed_by, completed_at)
         VALUES ($1::int, $2::date, $3::int, COALESCE($4::timestamp, CURRENT_TIMESTAMP))
         ON CONFLICT (task_id, completed_on) DO NOTHING`,
        [inserted.rows[0].id, completedOn, req.userId, completedAt]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      restored: true,
      restoredFromDismissal,
      task: inserted.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(err);
    res.status(500).json({ error: 'Failed to restore task' });
  } finally {
    client.release();
  }
});

// Checklist endpoints
router.post('/:id/checklists', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { item } = req.body;

    if (!item) return res.status(400).json({ error: 'Item text required' });

    // Verify task ownership
    const taskResult = await pool.query('SELECT schedule_id FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const scheduleResult = await pool.query('SELECT user_id FROM schedules WHERE id = $1', [taskResult.rows[0].schedule_id]);
    if (String(scheduleResult.rows[0].user_id) !== String(req.userId)) return res.status(403).json({ error: 'Forbidden' });

    const result = await pool.query(
      'INSERT INTO task_checklists (task_id, item) VALUES ($1, $2) RETURNING *',
      [id, item]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checklist item' });
  }
});

router.patch('/checklists/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_completed } = req.body;

    if (is_completed === undefined) return res.status(400).json({ error: 'is_completed required' });

    // Verify ownership through task and schedule
    const checklistResult = await pool.query(
      'SELECT t.schedule_id FROM task_checklists cl JOIN tasks t ON cl.task_id = t.id WHERE cl.id = $1',
      [id]
    );
    if (checklistResult.rows.length === 0) return res.status(404).json({ error: 'Checklist item not found' });

    const scheduleResult = await pool.query('SELECT user_id FROM schedules WHERE id = $1', [checklistResult.rows[0].schedule_id]);
    if (String(scheduleResult.rows[0].user_id) !== String(req.userId)) return res.status(403).json({ error: 'Forbidden' });

    const result = await pool.query(
      'UPDATE task_checklists SET is_completed = $1 WHERE id = $2 RETURNING *',
      [is_completed, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update checklist item' });
  }
});

router.delete('/checklists/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const checklistResult = await pool.query(
      'SELECT t.schedule_id FROM task_checklists cl JOIN tasks t ON cl.task_id = t.id WHERE cl.id = $1',
      [id]
    );
    if (checklistResult.rows.length === 0) return res.status(404).json({ error: 'Checklist item not found' });

    const scheduleResult = await pool.query('SELECT user_id FROM schedules WHERE id = $1', [checklistResult.rows[0].schedule_id]);
    if (String(scheduleResult.rows[0].user_id) !== String(req.userId)) return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM task_checklists WHERE id = $1', [id]);
    res.json({ message: 'Checklist item deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete checklist item' });
  }
});

export default router;
