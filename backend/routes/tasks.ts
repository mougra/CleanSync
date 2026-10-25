import express, { Request, Response } from 'express';
import pool from '../db';
import { appDay, appToday, clientToday, parseAppDay } from '../services/appTime';
import { authMiddleware } from '../auth';
import { checkAndAwardAchievements } from '../services/achievementManager';
import { canAccessSchedule } from '../services/household';
import { DEFAULT_TASK_SOURCE, normalizeTaskTitle } from '../services/defaultTasks';
import { HOME_PLAN_SOURCE } from '../services/homePlan';
import { canonicalZone } from '../services/zones';
import { resolveContentLocale, type ContentLocale } from '../services/contentLocale';

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

/**
 * Сегодняшний день и день отметки считаются в поясе приложения, а не в UTC:
 * после местной полуночи вчерашний план иначе выглядел бы сегодняшним, а
 * отметка уходила бы на чужую дату (см. services/appTime.ts).
 */
const isoDayOf = (timestamp: string): string => {
  const parsed = new Date(timestamp);

  return Number.isNaN(parsed.getTime()) ? appToday() : appDay(parsed);
};

/**
 * Задачи, попадающие на конкретный день.
 *
 * Условия периодичности живут в одном месте: «План на сегодня» и список
 * ближайших дней обязаны считать одинаково, иначе недельная задача появится в
 * одном месте и исчезнет в другом. Дата — в UTC, как было и раньше.
 *
 * Про интервал: интервал выражается **днями** для всех частот (миграция 0022),
 * поэтому день переводится в единицу периода (неделя — 7, месяц — 30) и уже она
 * сравнивается по модулю с опорой `due_date`. При интервале в одну единицу периода
 * (7/30) всё как раньше: задача недели/месяца.
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
const tasksDueOn = async (userId: string, date: Date, locale: ContentLocale) => {
  const dayOfWeek = date.getUTCDay(); // 0-6, 0 — воскресенье
  const dayOfMonth = date.getUTCDate(); // 1-31
  const dayStr = date.toISOString().split('T')[0];

  const result = await pool.query(
    `SELECT t.*,
            -- Названия задач и расписаний отдаём на языке запроса. Английский
            -- лежит в таблицах переводов, а ключом остаётся русское название:
            -- по нему генератор набора и «Вернуть» находят уже созданные задачи,
            -- поэтому подменять его в базе нельзя (правило про идемпотентность).
            COALESCE(tt.title, t.title) AS localized_title,
            COALESCE(st.title, s.title) as schedule_title,
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
     LEFT JOIN task_translations tt ON tt.task_id = t.id AND tt.locale = $6
     LEFT JOIN schedule_translations st ON st.schedule_id = s.id AND st.locale = $6
     WHERE (
             s.user_id = $1
             -- Общий план дома: задачи мои или ничейные, чужие не показываем
             OR (s.household_id IS NOT NULL
                 AND s.household_id IN (SELECT household_id FROM household_members WHERE user_id = $1)
                 AND (t.assignee_id IS NULL OR t.assignee_id = $1))
           )
       AND (
         -- Периодичность «раз в N дней» (interval_count). Интервал выражается
         -- **днями** для всех частот (миграция 0022): «раз в 3 недели» — это 21,
         -- «раз в 3 месяца» — 90. Чтобы сравнить цикл с опорой («due_date»), день
         -- переводится в единицу периода: неделя — 7 дней, месяц — 30.
         --
         -- Выбор формул не случаен. У **недельного** дела шаг цикла — это шаг
         -- выбранного дня недели, поэтому недели и считаются: 21 день — каждый
         -- третий понедельник. У **месячного** дела день месяца фиксирован
         -- («day_of_month»), поэтому и сравниваются календарные месяцы: «раз в 3
         -- месяца» — это сентябрь, декабрь, март, а не «каждые 90 дней от опоры».
         -- С дней на месяцы интервал переводится делением на 30 — ровно тот
         -- делитель, которым генератор мерил месячные ступени.
         (t.frequency = 'daily' AND t.interval_count <= 1) OR
         (t.frequency = 'daily' AND t.due_date IS NOT NULL
           AND MOD(($4::date - t.due_date), t.interval_count) = 0) OR
         (t.frequency = 'weekly' AND t.day_of_week = $2 AND t.interval_count = 7) OR
         (t.frequency = 'weekly' AND t.day_of_week = $2 AND t.due_date IS NOT NULL
           AND MOD(t.interval_count, 7) = 0
           AND MOD(FLOOR(($4::date - t.due_date)::numeric / 7)::int, t.interval_count / 7) = 0) OR
         (t.frequency = 'monthly' AND t.day_of_month = $3 AND t.interval_count = 30) OR
         (t.frequency = 'monthly' AND t.day_of_month = $3 AND t.due_date IS NOT NULL
           AND MOD(
                 MOD(
                   (EXTRACT(YEAR FROM $4::date) * 12 + EXTRACT(MONTH FROM $4::date))
                   - (EXTRACT(YEAR FROM t.due_date) * 12 + EXTRACT(MONTH FROM t.due_date)),
                   t.interval_count / 30
                 ) + t.interval_count / 30,
                 t.interval_count / 30
               ) = 0) OR
         (t.due_date = $4)
       )
     -- Архивные задачи (устаревшие сгенерированные, у которых уже есть история)
     -- в план не показываем: они остаются в базе ради журнала отметок, но человек
     -- их больше не видит. Так чистка набора не стирает серию и статистику.
     AND t.source IS DISTINCT FROM 'home_profile_archived'
     -- При равном или пустом времени Postgres не обещает порядок, и строки
     -- переставлялись после каждой отметки: идентификатор — устойчивый добор.
     ORDER BY t.time ASC NULLS LAST, t.id ASC`,
    [userId, dayOfWeek, dayOfMonth, dayStr, RECURRING_FREQUENCIES, locale]
  );

  /**
   * Наружу уходит `is_completed` на запрошенный день, а служебные колонки
   * `completed_for_day` и `localized_title` — нет: форма ответа «Сегодня»
   * и календаря остаётся прежней, меняется только смысл признака и язык текста.
   */
  return result.rows.map(({ completed_for_day, localized_title, ...task }) => ({
    ...task,
    title: localized_title ?? task.title,
    is_completed: completed_for_day === true,
  }));
};

// Get today's tasks
router.get('/today', authMiddleware, async (req: Request, res: Response) => {

  try {
    /**
     * «Сегодня» берём из устройства (`X-Client-Date`), а не из пояса приложения:
     * календарь в интерфейсе рисует дату браузера, и после местной полуночи
     * список отвечал «завтра». Без заголовка остаётся день приложения.
     */
    const tasks = await tasksDueOn(
      req.userId as string,
      parseAppDay(clientToday(req.headers['x-client-date'])) as Date,
      resolveContentLocale(req),
    );
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
    const start = parseAppDay(appToday()) as Date;

    const result = [];

    for (let offset = 1; offset <= days; offset += 1) {
      const date = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);
      const tasks = await tasksDueOn(userId, date, resolveContentLocale(req));

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
 * Пределы интервала периодичности: от суток до десяти лет в днях.
 *
 * Единица измерения интервала — **день** (`interval_count`), даже у недельных и
 * месячных дел: «раз в 3 недели» — это 21, «раз в 3 месяца» — 90. Нижняя граница
 * задана схемой (CHECK >= 1 в миграции 0012), верхняя — здесь: 3650 дней
 * (десять лет) отсекают мусорные значения, при которых задача «раз в 27 лет» уже
 * не периодичность, а недоразумение. Сгенерированный набор живёт в своём, более
 * узком коридоре (7…180 дней, services/defaultTasks.ts), но у своей задачи
 * человек вправе выбрать любой интервал.
 */
const MIN_INTERVAL_COUNT = 1;
const MAX_INTERVAL_COUNT = 3650;

/**
 * Разбор `interval_count` из тела запроса.
 *
 * Отсутствие поля — не ошибка (`null`): у создания это «раз в 1», у правки —
 * «интервал не меняем». А вот число вне пределов или не целое — ошибка клиента,
 * которую лучше назвать прямо, чем молча записать в базу ерунду.
 */
const parseIntervalCount = (value: unknown): { ok: true; value: number | null } | { ok: false } => {
  if (value === undefined || value === null) return { ok: true, value: null };

  if (typeof value !== 'number' || !Number.isInteger(value)) return { ok: false };

  if (value < MIN_INTERVAL_COUNT || value > MAX_INTERVAL_COUNT) return { ok: false };

  return { ok: true, value };
};

/** Интервал из тела запроса — в форме, пригодной для записи в колонку. */
interface IntervalInput {
  /** Интервал в днях после подстановки «раз в 1» на отсутствие значения. */
  interval: number;
  /** Можно ли писать `interval_count` в базу: у правки «поля нет» — нельзя. */
  storeInterval: boolean;
  dueDate: string | null;
}

/**
 * Опорная дата цикла — `due_date` — обязательна при интервале больше суток.
 *
 * Без неё выборка «Сегодня» не найдёт задачу никогда: при `interval_count > 1`
 * цикл считается как `MOD(день - due_date, interval_count)`, а с NULL это условие
 * ложно всегда. Поэтому сервер **подставляет сегодняшний
 * день приложения** (`services/appTime.ts`), а не отказывает: клиент, не знающий
 * про опору цикла, всё равно получит работающую задачу.
 */
const withDueDate = (dueDate: string | null, interval: number): string | null =>
  dueDate === null && interval > 1 ? appToday() : dueDate;

/**
 * Интервал и опора цикла для `POST /api/tasks` и `PUT /api/tasks/:id`.
 *
 * `existingDueDate` — опора, уже лежащая в задаче (у правки): она сохраняется,
 * когда клиент не передал дату, а интервал не менялся. Это то же самое, что делает
 * `COALESCE(due_date, …)` в UPDATE: молчание в теле не означает «сбросить опору».
 */
const intervalInput = (
  raw: unknown,
  fallbackInterval: number,
  dueDate: string | null,
  existingDueDate: string | null
): IntervalInput | null => {
  const parsed = parseIntervalCount(raw);

  if (!parsed.ok) return null;

  const interval = parsed.value ?? fallbackInterval;
  const storeInterval = parsed.value !== null;
  const kept = dueDate ?? (storeInterval ? null : existingDueDate);

  return { interval, storeInterval, dueDate: withDueDate(kept, interval) };
};

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
      const tasks = await tasksDueOn(userId, date, resolveContentLocale(req));
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

    // Периодичность: интервал выражается в днях, 1…3650. При интервале больше
    // суток опора цикла (`due_date`) обязательна и подставляется сегодняшним днём
    // приложения — иначе задача не появилась бы в плане никогда (правило 33).
    const schedule = intervalInput(interval_count, 1, due_date ?? null, null);

    if (schedule === null) {
      return res.status(400).json({
        error: `interval_count must be an integer between ${MIN_INTERVAL_COUNT} and ${MAX_INTERVAL_COUNT} days`,
      });
    }

    // `??`, а не `||`: ноль здесь законное значение. `day_of_week = 0` — это
    // воскресенье, и с `||` повтор на воскресенье сохранялся как «без дня».
    const result = await pool.query(
      'INSERT INTO tasks (schedule_id, title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room, interval_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, title, frequency, interval_count, day_of_week, day_of_month, due_date, time, estimated_minutes, room, is_completed, created_at',
      [schedule_id, title, frequency ?? null, day_of_week ?? null, day_of_month ?? null, schedule.dueDate, time ?? null, estimated_minutes ?? 0, canonicalZone(room), schedule.interval]
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
 *     они продолжают обновляться ровно как раньше, но теперь вторичны: серия
 *     (services/streak.ts), достижения (services/achievementManager.ts),
 *     статистика (routes/analytics.ts) и семейный режим (routes/household.ts)
 *     считают по журналу. Прежние колонки читают восстановление задачи
 *     (`POST /api/tasks/restore`), счётчик открытых назначений в доме и часть
 *     интерфейса; когда от них откажутся, это обновление можно заморозить —
 *     источником результата дня останется журнал.
 *
 * Две записи в одной транзакции нужны, чтобы не было состояния «флаг стоит, а
 * отметки нет»: по такой паре задача выглядела бы закрытой в статистике дома и
 * открытой в календаре.
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room, is_completed, interval_count, completed_on } = req.body;

    // Check ownership via schedule
    const taskResult = await pool.query(
      'SELECT schedule_id, interval_count, due_date FROM tasks WHERE id = $1',
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

    /**
     * Интервал и опора цикла. Интервал в теле — уже в днях (1…3650), а если поле
     * не пришло, задача сохраняет прежний. При интервале больше суток опора
     * обязательна: без неё задача не появится в плане никогда (правило 33), и
     * сервер подставляет сегодняшний день приложения — так же, как при создании.
     */
    const schedule = intervalInput(
      interval_count,
      Number(taskResult.rows[0].interval_count) || 1,
      due_date ?? null,
      taskResult.rows[0].due_date ?? null
    );

    if (schedule === null) {
      return res.status(400).json({
        error: `interval_count must be an integer between ${MIN_INTERVAL_COUNT} and ${MAX_INTERVAL_COUNT} days`,
      });
    }

    /**
     * День, к которому относится отметка.
     *
     * Раньше это всегда был «сегодня» приложения, поэтому отметить дело за
     * прошлый или будущий день было нельзя: галочка ставилась только на текущую
     * дату. Теперь клиент присылает `completed_on` — день, который человек
     * смотрит в календаре. Если поля нет (старый клиент, правка названия), день
     * берётся из `X-Client-Date`, иначе — день приложения.
     *
     * Момент отметки при этом остаётся настоящим: `completed_at` пишет Postgres
     * сейчас, и серия считает именно его, а не день дела (см. services/streak.ts).
     */
    const completedOn =
      parseAppDay(completed_on)?.toISOString().slice(0, 10) ??
      clientToday(req.headers['x-client-date']);

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
        -- Интервал периодичности: принимаем только целое в пределах 1…3650
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
      [title ?? null, frequency ?? null, day_of_week ?? null, day_of_month ?? null, schedule.dueDate, time ?? null, estimated_minutes ?? null, canonicalZone(room), is_completed !== undefined ? is_completed : null, id, req.userId, schedule.storeInterval ? schedule.interval : null]
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
 * POST /api/tasks/:id/move — перенести дело на другой день.
 *
 * Переносится **вся серия**, а не одно вхождение: у недельной задачи меняется
 * `day_of_week`, у месячной — `day_of_month`, а `due_date` становится новой
 * опорой цикла (правило 33). Так дело сохраняет свою периодичность и просто
 * встаёт на другой день — это и просил заказчик.
 *
 * Периодичность не пересчитывается и интервал не меняется: «раз в две недели»
 * остаётся «раз в две недели», сдвигается только день.
 *
 * Через `PUT /api/tasks/:id` это сделать нельзя: клиенту пришлось бы знать,
 * какое поле менять для каждой частоты, и правило расползлось бы по интерфейсу.
 */
router.post('/:id/move', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const target = parseAppDay(req.body?.toDate ?? req.body?.to_date);

    if (!target) {
      return res.status(400).json({ error: 'toDate must be a date in YYYY-MM-DD format' });
    }

    const found = await pool.query<{ schedule_id: number; frequency: string | null }>(
      'SELECT schedule_id, frequency FROM tasks WHERE id = $1',
      [id]
    );

    if (found.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const access = await canAccessSchedule(String(req.userId), found.rows[0].schedule_id);

    if (!access.allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const frequency = found.rows[0].frequency;
    const iso = target.toISOString().slice(0, 10);

    const updated = await pool.query(
      `UPDATE tasks SET
         day_of_week = CASE WHEN $2 = 'weekly' THEN $3::int ELSE day_of_week END,
         day_of_month = CASE WHEN $2 = 'monthly' THEN $4::int ELSE day_of_month END,
         -- Опора цикла переезжает вместе с делом: по ней считается «раз в N дней»
         due_date = $5::date
       WHERE id = $1
       RETURNING ${TASK_PAYLOAD_COLUMNS}`,
      [id, frequency, target.getUTCDay(), target.getUTCDate(), iso]
    );

    res.json({ ...updated.rows[0], movedTo: iso });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move task' });
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
        restoreText(body.room) === null ? null : canonicalZone(body.room),
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
      const completedOn = completedAt === null ? appToday() : isoDayOf(completedAt);

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
