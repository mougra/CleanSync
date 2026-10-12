import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db';
import { generateTokens } from '../auth';
import { appToday } from '../services/appTime';

/**
 * Личная серия считает активность дня по журналу отметок (миграция 0018).
 *
 * До журнала серия смотрела на последнюю отметку задачи
 * (`tasks.completed_at` / `completed_by`): снятая галочка стирала день из
 * истории, и серия рушилась задним числом. Теперь день активности — строка
 * `task_completions` на этот день, поэтому:
 *   * отметка сегодня делает день активным;
 *   * снятие единственной отметки дня убирает **этот** день из активности;
 *   * снятие одной из нескольких отметок день не ломает;
 *   * отметка прошлого дня продолжает считаться, а снятие сегодняшней галочки
 *     историю прошлых дней не стирает.
 *
 * Дни считаются в поясе приложения (`appToday`), как и сами отметки: сравнение
 * идёт именно с тем днём, которым датирует отметку `PUT /api/tasks/:id`.
 * Тесты работают с настоящей базой, как CI; без базы блок пропускается.
 */

const dbReady = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch(() => false);

const createdUserIds: number[] = [];

/** Сдвиг календарного дня: день ходит строкой `YYYY-MM-DD`. */
const shiftDays = (iso: string, delta: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};

interface Fixture {
  userId: number;
  scheduleId: number;
  token: string;
}

const createFixture = async (): Promise<Fixture> => {
  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password)
     VALUES ($1, $2)
     RETURNING id`,
    [
      `streak-journal-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      'test-password-hash',
    ]
  );

  const userId = user.rows[0].id;
  createdUserIds.push(userId);

  const schedule = await pool.query<{ id: number }>(
    `INSERT INTO schedules (user_id, title) VALUES ($1, 'Серия QA') RETURNING id`,
    [userId]
  );

  return {
    userId,
    scheduleId: schedule.rows[0].id,
    token: generateTokens(String(userId)).accessToken,
  };
};

const createTask = async (scheduleId: number, title: string): Promise<number> => {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO tasks (schedule_id, title, frequency, estimated_minutes)
     VALUES ($1, $2, 'daily', 10)
     RETURNING id`,
    [scheduleId, title]
  );

  return result.rows[0].id;
};

interface StreakBody {
  today: string;
  current: number;
  best: number;
  todayDone: boolean;
  lastActiveOn: string | null;
  freezesAvailable: number;
  week: {
    start: string;
    days: Array<{ date: string; active: boolean; isToday: boolean }>;
    activeDays: number;
    target: number;
    met: boolean;
  };
}

const fetchStreak = (token: string) =>
  request(app)
    .get('/api/streak')
    .set('Authorization', `Bearer ${token}`);

const markTask = (token: string, taskId: number, isCompleted: boolean) =>
  request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ is_completed: isCompleted });

const dayState = (body: StreakBody, date: string) =>
  body.week.days.find((day) => day.date === date);

describe.skipIf(!dbReady)('серия и журнал отметок по дням', () => {
  it('считает день активным по отметке журнала, а не по флагу задачи', async () => {
    const { scheduleId, token } = await createFixture();
    const taskId = await createTask(scheduleId, 'Дело для серии');

    const before = await fetchStreak(token);

    expect(before.status).toBe(200);
    expect(before.body.today).toBe(appToday());
    expect(before.body.todayDone).toBe(false);
    expect(before.body.current).toBe(0);

    const marked = await markTask(token, taskId, true);

    expect(marked.status).toBe(200);

    const after = await fetchStreak(token);
    const body = after.body as StreakBody;

    expect(body.todayDone).toBe(true);
    expect(body.current).toBeGreaterThanOrEqual(1);
    expect(body.best).toBeGreaterThanOrEqual(1);
    expect(body.lastActiveOn).toBe(appToday());
    expect(dayState(body, appToday())?.active).toBe(true);
    expect(dayState(body, appToday())?.isToday).toBe(true);

    // Отметка лежит на сегодняшний день приложения — тем же днём считает серия.
    const journal = await pool.query<{ completed_on: string }>(
      'SELECT completed_on::text AS completed_on FROM task_completions WHERE task_id = $1',
      [taskId]
    );

    expect(journal.rows.map((row) => row.completed_on)).toEqual([appToday()]);
  });

  it('снятие единственной отметки дня делает день неактивным', async () => {
    const { scheduleId, token } = await createFixture();
    const taskId = await createTask(scheduleId, 'Единственное дело дня');

    await markTask(token, taskId, true);

    const marked = (await fetchStreak(token)).body as StreakBody;
    expect(marked.todayDone).toBe(true);

    const unmarked = await markTask(token, taskId, false);

    expect(unmarked.status).toBe(200);

    const journal = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM task_completions WHERE task_id = $1',
      [taskId]
    );

    expect(journal.rows[0].total).toBe(0);

    const after = (await fetchStreak(token)).body as StreakBody;

    expect(after.todayDone).toBe(false);
    expect(after.current).toBe(0);
    expect(after.week.activeDays).toBe(0);
    expect(dayState(after, appToday())?.active).toBe(false);
  });

  it('снятие одной отметки из двух оставляет день активным', async () => {
    const { scheduleId, token } = await createFixture();
    const firstId = await createTask(scheduleId, 'Первое дело дня');
    const secondId = await createTask(scheduleId, 'Второе дело дня');

    await markTask(token, firstId, true);
    await markTask(token, secondId, true);

    await markTask(token, firstId, false);

    const after = (await fetchStreak(token)).body as StreakBody;

    expect(after.todayDone).toBe(true);
    expect(after.current).toBeGreaterThanOrEqual(1);
    expect(dayState(after, appToday())?.active).toBe(true);

    const left = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM task_completions WHERE task_id = $1',
      [secondId]
    );

    expect(left.rows[0].total).toBe(1);
  });

  it('учитывает отметку прошлого дня и не стирает её снятием сегодняшней', async () => {
    const { userId, scheduleId, token } = await createFixture();
    const yesterdayTaskId = await createTask(scheduleId, 'Вчерашнее дело');
    const todayTaskId = await createTask(scheduleId, 'Сегодняшнее дело');
    const yesterday = shiftDays(appToday(), -1);

    // Отметку задним числом через API не поставить: PUT отмечает только сегодня,
    // поэтому прошлый день пишем в журнал напрямую — так же лежит история.
    await pool.query(
      `INSERT INTO task_completions (task_id, completed_on, completed_by, completed_at)
       VALUES ($1::int, $2::date, $3::int, $4::timestamp)`,
      [yesterdayTaskId, yesterday, userId, `${yesterday} 12:00:00`]
    );

    const onlyYesterday = (await fetchStreak(token)).body as StreakBody;

    expect(onlyYesterday.todayDone).toBe(false);
    expect(onlyYesterday.lastActiveOn).toBe(yesterday);
    expect(onlyYesterday.current).toBeGreaterThanOrEqual(1);

    // Сегодня закрываем и тут же снимаем: вчерашняя отметка обязана остаться.
    await markTask(token, todayTaskId, true);
    await markTask(token, todayTaskId, false);

    const after = (await fetchStreak(token)).body as StreakBody;

    expect(after.todayDone).toBe(false);
    expect(after.lastActiveOn).toBe(yesterday);
    expect(after.current).toBe(1);

    const journal = await pool.query<{ completed_on: string }>(
      'SELECT completed_on::text AS completed_on FROM task_completions WHERE task_id = $1',
      [yesterdayTaskId]
    );

    expect(journal.rows.map((row) => row.completed_on)).toEqual([yesterday]);
  });
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await pool
      .query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds])
      .catch(() => undefined);
  }
});
