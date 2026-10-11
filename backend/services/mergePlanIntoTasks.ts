import type { PoolClient } from 'pg';
import pool from '../db';
import { getTaskCatalog, type TaskCadence } from './taskCatalog';
import {
  DEFAULT_TASK_SOURCE,
  DEFAULT_TASKS_SCHEDULE_TITLE,
  buildDefaultTasks,
  cadenceSchedule,
  freeMinutesByMonthDay,
  myTasksScheduleDescription,
  normalizeTaskTitle,
} from './defaultTasks';
import { answersFromStoredRow, type HomeAnswers, type StoredHomeAnswers } from './homePlan';

/**
 * Перенос задач недельного плана «План по дому» в постоянный набор «Мои задачи».
 *
 * Зачем. Заказчик оставил один источник задач — набор «Мои задачи»
 * (services/defaultTasks.ts). Недельный план больше не создаётся
 * (routes/homeProfile.ts), но у части пользователей расписание «План по дому» уже
 * есть, и его задачи не должны пропасть: они переезжают в «Мои задачи», где
 * получают периодичность по каталогу и живут дальше как обычные дела набора.
 *
 * Идемпотентность. Три вещи держат её вместе:
 *  1. ключ сравнения — нормализованное название задачи (обрезанные пробелы и
 *     регистр, помощник `normalizeTaskTitle`): дубль по названию не переносится,
 *     а его строка в старом плане удаляется — задача уже есть в наборе, и держать
 *     её второй копией в уходящем расписании незачем (иначе расписание нельзя
 *     было бы удалить никогда);
 *  2. та же advisory-блокировка, что и у syncDefaultTasks: два одновременных
 *     вызова не создадут два расписания «Мои задачи»;
 *  3. после переноса расписание «План по дому» удаляется, если в нём не осталось
 *     задач. Повторный вызов просто не находит план и ничего не делает.
 *
 * Периодичность перенесённых задач берётся из каталога (`cadence` задачи) теми же
 * правилами, что и в наборе: `cadenceSchedule` в services/defaultTasks.ts. Если
 * названия в каталоге нет, задача остаётся разовой (`once` с `due_date` = сегодня)
 * и попадает в отчёт как «без каталога» — придумывать интервал нельзя.
 *
 * Выполненные задачи переносятся вместе с `is_completed` и `completed_at`
 * (история нужна аналитике), но повторяющимися не становятся: остаются `once` со
 * своей датой. Пометка источника у всех перенесённых — `home_profile_defaults`:
 * теперь это часть единого набора, и пересборка с дневным бюджетом обязаны их
 * учитывать.
 */

/** Заголовок расписания недельного плана: по нему план находится и переносится. */
export const HOME_PLAN_SCHEDULE_TITLE = 'План по дому';

/** Отчёт о переносе: сводка для маршрута, скрипта и тестов. */
export interface MergePlanReport {
  /** Расписание «План по дому» или null, если его не было. */
  planScheduleId: number | null;
  /** Расписание «Мои задачи»: куда переносили (или null, если переносить было нечего). */
  myTasksScheduleId: number | null;
  /** Создано ли расписание «Мои задачи» этим вызовом. */
  createdSchedule: boolean;
  /** Перенесено задач (schedule_id сменился на «Мои задачи»). */
  moved: number;
  /** Названия перенесённых задач. */
  movedTitles: string[];
  /** Дубли по названию: уже были в «Моих задачах», из плана удалены. */
  duplicates: number;
  /**
   * Задачи плана, которые человек когда-то удалил (память об отказах,
   * миграция 0017): в набор не возвращаются, из плана удаляются.
   */
  dismissed: number;
  /** Из перенесённых задач — выполненные (перенесены как разовые, с историей). */
  completed: number;
  /** Названия без совпадения в каталоге: остались разовыми. */
  withoutCatalog: string[];
  /** Сколько задач осталось в «Плане по дому» после переноса. */
  remaining: number;
  /** Что именно осталось — чтобы отчёт объяснял, почему расписание не удалено. */
  remainingTitles: string[];
  /** Удалено ли расписание «План по дому». */
  planDeleted: boolean;
}

/** Задача плана в объёме, нужном для переноса. */
interface PlanTaskRow {
  id: number;
  title: string;
  estimated_minutes: number | null;
  due_date: string | null;
  is_completed: boolean;
}

/** Задача «Моих задач» в объёме, нужном для расчёта свободных чисел месяца. */
interface MyTaskRow {
  title: string;
  frequency: string | null;
  day_of_week: number | null;
  day_of_month: number | null;
  estimated_minutes: number | null;
}

const PROFILES_COLUMNS = `housing_type, rooms, composition, pets, outdoor, has_kids_room,
  has_garage, works_from_home, drying, cleaning_level, daily_minutes, cleaning_style,
  cleaning_days, hardest_zone`;

/** Ответы анкеты пользователя или значения по умолчанию, если анкеты нет. */
const loadAnswers = async (client: PoolClient, userId: string): Promise<HomeAnswers> => {
  const result = await client.query<StoredHomeAnswers>(
    `SELECT ${PROFILES_COLUMNS} FROM home_profiles WHERE user_id = $1`,
    [userId]
  );

  return answersFromStoredRow(result.rows[0] ?? ({} as StoredHomeAnswers));
};

/**
 * Расписание «Мои задачи» пользователя: находим или создаём.
 *
 * Создание повторяет syncDefaultTasks в routes/homeProfile.ts строка в строку
 * (включая описание из `myTasksScheduleDescription`): расписание, заведённое
 * переносом, не должно отличаться от заведённого анкетой.
 */
const ensureMyTasksSchedule = async (
  client: PoolClient,
  userId: string,
  description: string
): Promise<{ id: number; created: boolean }> => {
  const existing = await client.query<{ id: number }>(
    'SELECT id FROM schedules WHERE user_id = $1 AND title = $2 ORDER BY id LIMIT 1',
    [userId, DEFAULT_TASKS_SCHEDULE_TITLE]
  );

  if (existing.rows[0]) {
    return { id: existing.rows[0].id, created: false };
  }

  const inserted = await client.query<{ id: number }>(
    `INSERT INTO schedules (user_id, title, description)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, DEFAULT_TASKS_SCHEDULE_TITLE, description]
  );

  return { id: inserted.rows[0].id, created: true };
};

/** Пустой отчёт: план не найден, делать нечего. */
const nothingToDo = (): MergePlanReport => ({
  planScheduleId: null,
  myTasksScheduleId: null,
  createdSchedule: false,
  moved: 0,
  movedTitles: [],
  duplicates: 0,
  dismissed: 0,
  completed: 0,
  withoutCatalog: [],
  remaining: 0,
  remainingTitles: [],
  planDeleted: false,
});

/** ISO-дата без времени: `due_date` — колонка DATE. */
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Переносит задачи «Плана по дому» в «Мои задачи». Идемпотентно.
 *
 * `today` передаётся параметром: от него зависят опорные даты циклов и дата
 * разовых задач, а в проверках нужен предсказуемый результат.
 */
export const mergePlanIntoTasks = async (
  userId: string,
  today: Date = new Date()
): Promise<MergePlanReport> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    /**
     * Та же блокировка, что и в syncDefaultTasks: ключ — заголовок расписания
     * плюс пользователь. Без неё перенос и одновременная пересборка набора могли
     * бы создать два расписания «Мои задачи».
     */
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), $2::int)', [
      DEFAULT_TASKS_SCHEDULE_TITLE,
      userId,
    ]);

    const plan = await client.query<{ id: number }>(
      'SELECT id FROM schedules WHERE user_id = $1 AND title = $2 ORDER BY id LIMIT 1',
      [userId, HOME_PLAN_SCHEDULE_TITLE]
    );

    if (!plan.rows[0]) {
      await client.query('COMMIT');

      return nothingToDo();
    }

    const planScheduleId = plan.rows[0].id;
    const answers = await loadAnswers(client, userId);
    const defaultSet = buildDefaultTasks(answers, today);
    const myTasks = await ensureMyTasksSchedule(
      client,
      userId,
      myTasksScheduleDescription(defaultSet)
    );

    const existing = await client.query<MyTaskRow>(
      `SELECT title, frequency, day_of_week, day_of_month, estimated_minutes
         FROM tasks WHERE schedule_id = $1`,
      [myTasks.id]
    );

    /**
     * Свободные минуты чисел месяца: считаем по тому, что уже лежит в «Моих
     * задачах» (ежедневный минимум и недельные дела занимают день), и вычитаем
     * уже разложенные месячные — перенесённое редкое дело не должно лечь на
     * занятое число. Расчёт — общий помощник набора, второй таблицы чисел нет.
     */
    const dailyMinutes = existing.rows
      .filter((row) => row.frequency === 'daily')
      .reduce((sum, row) => sum + (row.estimated_minutes ?? 0), 0);
    const weeklyByWeekday = new Map<number, number>();

    for (const row of existing.rows) {
      if (row.frequency !== 'weekly' || row.day_of_week === null) continue;

      weeklyByWeekday.set(
        row.day_of_week,
        (weeklyByWeekday.get(row.day_of_week) ?? 0) + (row.estimated_minutes ?? 0)
      );
    }

    const freeByDate = freeMinutesByMonthDay({
      answers,
      dailyMinutes,
      weeklyByWeekday,
      today,
    });

    for (const row of existing.rows) {
      if (row.frequency !== 'monthly' || row.day_of_month === null) continue;

      freeByDate.set(
        row.day_of_month,
        Math.max(0, (freeByDate.get(row.day_of_month) ?? 0) - (row.estimated_minutes ?? 0))
      );
    }

    const planTasks = await client.query<PlanTaskRow>(
      `SELECT id, title, estimated_minutes, due_date::text AS due_date, is_completed
         FROM tasks WHERE schedule_id = $1 ORDER BY id`,
      [planScheduleId]
    );

    const catalog = new Map(
      getTaskCatalog().map((task) => [normalizeTaskTitle(task.task), task])
    );
    const knownTitles = new Set(existing.rows.map((row) => normalizeTaskTitle(row.title)));
    /**
     * Память об отказах (миграция 0017): названия, которые человек удалил.
     *
     * Перенос обязан её уважать. Иначе задача, удалённая из «Моих задач», но
     * оставшаяся в старом плане, вернулась бы в набор при переносе — ровно то
     * воскрешение, от которого список отказов и заводили.
     */
    const dismissedRows = await client.query<{ title: string }>(
      'SELECT title FROM dismissed_default_tasks WHERE user_id = $1',
      [userId]
    );
    const dismissed = new Set(dismissedRows.rows.map((row) => normalizeTaskTitle(row.title)));
    const monthOffset = new Map<TaskCadence, number>();

    const report: MergePlanReport = {
      planScheduleId,
      myTasksScheduleId: myTasks.id,
      createdSchedule: myTasks.created,
      moved: 0,
      movedTitles: [],
      duplicates: 0,
      dismissed: 0,
      completed: 0,
      withoutCatalog: [],
      remaining: 0,
      remainingTitles: [],
      planDeleted: false,
    };

    const duplicateIds: number[] = [];

    for (const task of planTasks.rows) {
      const key = normalizeTaskTitle(task.title);

      // Название уже есть в наборе: копию не создаём, а строку уходящего плана
      // убираем — задача человека живёт в «Моих задачах», и вторая её копия
      // только мешала бы закрыть расписание.
      if (knownTitles.has(key)) {
        duplicateIds.push(task.id);
        report.duplicates += 1;
        continue;
      }

      // Удалённое человеком не возвращаем: строка уходит вместе с планом.
      if (dismissed.has(key)) {
        duplicateIds.push(task.id);
        report.dismissed += 1;
        continue;
      }

      knownTitles.add(key);
      const catalogTask = catalog.get(key);
      /**
       * Выполненная задача остаётся историей: повторяющейся её делать нельзя,
       * иначе она снова начала бы всплывать в «Сегодня». Разовой становится и
       * задача, которой нет в каталоге — интервал для неё придумывать нечем.
       */
      let schedule: {
        frequency: string;
        intervalCount: number;
        dayOfWeek: number | null;
        dayOfMonth: number | null;
        dueDate: string | null;
      };

      if (task.is_completed || !catalogTask) {
        schedule = {
          frequency: 'once',
          intervalCount: 1,
          dayOfWeek: null,
          dayOfMonth: null,
          dueDate: task.due_date ?? isoDate(today),
        };

        if (!catalogTask) report.withoutCatalog.push(task.title);
      } else {
        schedule = cadenceSchedule({
          cadence: catalogTask.cadence,
          answers,
          today,
          freeByDate,
          monthOffset: monthOffset.get(catalogTask.cadence) ?? 0,
        });

        if (schedule.frequency === 'monthly') {
          const day = schedule.dayOfMonth ?? 1;

          monthOffset.set(catalogTask.cadence, (monthOffset.get(catalogTask.cadence) ?? 0) + 1);
          freeByDate.set(
            day,
            Math.max(0, (freeByDate.get(day) ?? 0) - (task.estimated_minutes ?? 0))
          );
        }
      }

      if (task.is_completed) report.completed += 1;

      await client.query(
        `UPDATE tasks
            SET schedule_id = $1,
                frequency = $2,
                interval_count = $3,
                day_of_week = $4,
                day_of_month = $5,
                due_date = $6,
                source = $7
          WHERE id = $8`,
        [
          myTasks.id,
          schedule.frequency,
          schedule.intervalCount,
          schedule.dayOfWeek,
          schedule.dayOfMonth,
          schedule.dueDate,
          DEFAULT_TASK_SOURCE,
          task.id,
        ]
      );

      report.moved += 1;
      report.movedTitles.push(task.title);
    }

    if (duplicateIds.length > 0) {
      await client.query('DELETE FROM tasks WHERE id = ANY($1::int[])', [duplicateIds]);
    }

    const rest = await client.query<{ title: string }>(
      'SELECT title FROM tasks WHERE schedule_id = $1 ORDER BY id',
      [planScheduleId]
    );

    report.remaining = rest.rows.length;
    report.remainingTitles = rest.rows.map((row) => row.title);

    /**
     * Расписание удаляем только если в нём не осталось задач. Остаться может
     * разве что то, что мы сознательно не тронули, — и тогда лучше рассказать об
     * этом в отчёте, чем молча удалить чужие строки.
     */
    if (rest.rows.length === 0) {
      await client.query('DELETE FROM schedules WHERE id = $1', [planScheduleId]);
      report.planDeleted = true;
    }

    await client.query('COMMIT');

    return report;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default mergePlanIntoTasks;
