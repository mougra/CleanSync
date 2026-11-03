import pool from '../db';
import { APP_TIME_ZONE, SQL_APP_TODAY } from './appTime';

/**
 * Таймер уборки: одна активная сессия на человека.
 *
 * Зачем отдельная таблица, а не поле у задачи. Факт — это не «задача сделана», а
 * «сколько времени человек на неё потратил»: сессий у задачи может быть
 * несколько (начал, отвлёкся, вернулся), а бывает и уборка без конкретной задачи
 * («просто прибрался»). Поэтому запись живёт сама по себе и лишь ссылается на
 * задачу, если та известна.
 *
 * Время считаем как `(конец − старт) − паузы`: пауза добавляет к
 * `paused_seconds` отрезок с прошлого возобновления, поэтому «идёт 12 минут» не
 * растёт, пока таймер стоит.
 */

export interface FocusRow {
  id: number;
  task_id: number | null;
  title: string | null;
  room: string | null;
  started_at: string;
  last_resumed_at: string;
  paused_seconds: number;
  ended_at: string | null;
  status: 'running' | 'paused' | 'finished';
}

/** Сколько секунд таймер реально шёл. Для завершённой сессии — до её конца. */
export const activeSeconds = (row: FocusRow, now: number = Date.now()): number => {
  const end = row.ended_at ? new Date(row.ended_at).getTime() : now;
  const total = Math.floor((end - new Date(row.started_at).getTime()) / 1000) - row.paused_seconds;

  return Math.max(0, total);
};

/** Форма для клиента: срез строки плюс посчитанные секунды. */
export const sessionView = (row: FocusRow) => ({
  id: row.id,
  taskId: row.task_id,
  title: row.title,
  room: row.room,
  status: row.status,
  seconds: activeSeconds(row),
  startedAt: row.started_at,
});

const SELECT_COLUMNS = 'id, task_id, title, room, started_at, last_resumed_at, paused_seconds, ended_at, status';

/** Активная сессия (идёт или на паузе). Завершённых может быть много, активная одна. */
export const getActiveSession = async (userId: string): Promise<FocusRow | null> => {
  const result = await pool.query<FocusRow>(
    `SELECT ${SELECT_COLUMNS} FROM focus_sessions
      WHERE user_id = $1 AND status <> 'finished'
      ORDER BY id DESC LIMIT 1`,
    [userId],
  );

  return result.rows[0] ?? null;
};

/**
 * Разбор задачи для сессии: название и зона запоминаем в момент старта.
 *
 * Снимок, а не ссылка: задачу могут переименовать или удалить, а статистика за
 * прошлую неделю не должна из-за этого поменяться.
 */
const taskSnapshot = async (userId: string, taskId: number) => {
  const result = await pool.query<{ title: string; room: string | null }>(
    `SELECT t.title, t.room
       FROM tasks t
       JOIN schedules s ON s.id = t.schedule_id
      WHERE t.id = $1
        AND (s.user_id = $2
             OR (s.household_id IS NOT NULL
                 AND s.household_id IN (SELECT household_id FROM household_members WHERE user_id = $2)))
      LIMIT 1`,
    [taskId, userId],
  );

  return result.rows[0] ?? null;
};

/**
 * Старт таймера. Если уже что-то идёт — предыдущую сессию завершаем.
 *
 * Молча «переключаем» задачу, а не отвечаем конфликтом: человек нажал «приступить
 * к другому делу», и терять уже отмеренное время из-за этого нельзя.
 */
export const startSession = async (
  userId: string,
  taskId: number | null,
): Promise<FocusRow> => {
  await finishActive(userId);

  const snapshot = taskId === null ? null : await taskSnapshot(userId, taskId);

  const result = await pool.query<FocusRow>(
    `INSERT INTO focus_sessions (user_id, task_id, title, room)
     VALUES ($1, $2, $3, $4)
     RETURNING ${SELECT_COLUMNS}`,
    [userId, taskId, snapshot?.title ?? null, snapshot?.room ?? null],
  );

  return result.rows[0];
};

/** Завершение активной сессии (если она есть): используется стартом и «Завершить». */
export const finishActive = async (userId: string): Promise<FocusRow | null> => {
  const active = await getActiveSession(userId);

  if (!active) {
    return null;
  }

  // Идущий отрезок до завершения — это либо работа (running), либо пауза (paused):
  // в первом случае его надо вычесть, во втором он уже в paused_seconds.
  const now = Date.now();
  const extraPause =
    active.status === 'running'
      ? Math.max(0, Math.floor((now - new Date(active.last_resumed_at).getTime()) / 1000))
      : 0;

  const result = await pool.query<FocusRow>(
    `UPDATE focus_sessions
        SET status = 'finished',
            ended_at = now(),
            paused_seconds = paused_seconds + $2
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [active.id, extraPause],
  );

  return result.rows[0] ?? null;
};

export const pauseSession = async (userId: string): Promise<FocusRow | null> => {
  const active = await getActiveSession(userId);

  if (!active || active.status !== 'running') {
    return active;
  }

  const paused = Math.max(0, Math.floor((Date.now() - new Date(active.last_resumed_at).getTime()) / 1000));

  const result = await pool.query<FocusRow>(
    `UPDATE focus_sessions
        SET status = 'paused',
            paused_seconds = paused_seconds + $2
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [active.id, paused],
  );

  return result.rows[0] ?? null;
};

export const resumeSession = async (userId: string): Promise<FocusRow | null> => {
  const active = await getActiveSession(userId);

  if (!active || active.status !== 'paused') {
    return active;
  }

  const result = await pool.query<FocusRow>(
    `UPDATE focus_sessions
        SET status = 'running',
            last_resumed_at = now()
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [active.id],
  );

  return result.rows[0] ?? null;
};

/**
 * Фактические минуты по дням: только завершённые сессии.
 *
 * День считается в поясе приложения, как и всё остальное в статистике: сессия
 * в 23:30 не должна переезжать на следующую дату.
 */
export const focusMinutesByDay = async (
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<Map<string, number>> => {
  const result = await pool.query<{ day: string; seconds: number }>(
    `SELECT to_char((started_at AT TIME ZONE $4)::date, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) - paused_seconds), 0)::int AS seconds
       FROM focus_sessions
      WHERE user_id = $1
        AND status = 'finished'
        AND ended_at IS NOT NULL
        AND (started_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
      GROUP BY 1`,
    [userId, fromIso, toIso, APP_TIME_ZONE],
  );

  return new Map(result.rows.map((row) => [row.day, Math.max(0, Math.round(row.seconds / 60))]));
};

/** Факт за один день: короткая обёртка для сводки «Сегодня». */
export const focusMinutesOn = async (userId: string, iso: string): Promise<number> => {
  const byDay = await focusMinutesByDay(userId, iso, iso);

  return byDay.get(iso) ?? 0;
};

/**
 * Факт за период статистики: минуты по завершённым сессиям.
 *
 * `days === null` — всё время. Граница считается по дню приложения, как и
 * остальные срезы: сессия в 23:30 относится к своему дню, а не к следующему.
 */
export const focusMinutesForPeriod = async (
  userId: string,
  days: number | null,
): Promise<number> => {
  const result = await pool.query<{ seconds: number }>(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) - paused_seconds), 0)::int AS seconds
       FROM focus_sessions
      WHERE user_id = $1
        AND status = 'finished'
        AND ended_at IS NOT NULL
        AND (
          $2::int IS NULL
          OR (started_at AT TIME ZONE $3)::date >= (${SQL_APP_TODAY} - ($2 || ' days')::interval)::date
        )`,
    [userId, days, APP_TIME_ZONE],
  );

  return Math.max(0, Math.round(Number(result.rows[0]?.seconds ?? 0) / 60));
};
