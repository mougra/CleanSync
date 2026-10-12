import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db';
import { generateTokens } from '../auth';
import { appToday } from '../services/appTime';

/**
 * «Статистика» считает сделанное по журналу отметок (миграция 0018).
 *
 * До журнала разделы смотрели на последнюю отметку задачи
 * (`tasks.is_completed` / `completed_at`): «сделано за период» и история
 * показывали одну и ту же задачу один раз, а снятая галочка вычёркивала её из
 * прошлого. Теперь источник — строки `task_completions`, поэтому сегодня и вчера
 * различимы, а окна дат считает Postgres в поясе приложения (`SQL_APP_TODAY`).
 *
 * Форма ответов не менялась — проверки идут по прежним полям. Тесты работают с
 * настоящей базой, как CI; без базы блок пропускается.
 */

const dbReady = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch(() => false);

const createdUserIds: number[] = [];

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
      `analytics-journal-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      'test-password-hash',
    ]
  );

  const userId = user.rows[0].id;
  createdUserIds.push(userId);

  const schedule = await pool.query<{ id: number }>(
    `INSERT INTO schedules (user_id, title) VALUES ($1, 'Статистика QA') RETURNING id`,
    [userId]
  );

  return {
    userId,
    scheduleId: schedule.rows[0].id,
    token: generateTokens(String(userId)).accessToken,
  };
};

const createTask = async (
  scheduleId: number,
  title: string,
  minutes: number,
  room: string
): Promise<number> => {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO tasks (schedule_id, title, frequency, estimated_minutes, room)
     VALUES ($1, $2, 'daily', $3, $4)
     RETURNING id`,
    [scheduleId, title, minutes, room]
  );

  return result.rows[0].id;
};

const markTask = (token: string, taskId: number) =>
  request(app)
    .put(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ is_completed: true });

/** Отметка прошлого дня: через API её не поставить, поэтому пишем в журнал напрямую. */
const insertCompletion = (taskId: number, userId: number, day: string) =>
  pool.query(
    `INSERT INTO task_completions (task_id, completed_on, completed_by, completed_at)
     VALUES ($1::int, $2::date, $3::int, $4::timestamp)`,
    [taskId, day, userId, `${day} 12:00:00`]
  );

interface ActivityRow {
  date: string;
  tasks: number;
  challenge_tasks: number;
  habit_checkins: number;
  minutes: number;
}

describe.skipIf(!dbReady)('аналитика по журналу отметок', () => {
  it('в сводке различает сегодня и вчера и считает минуты по дням', async () => {
    const { userId, scheduleId, token } = await createFixture();
    const todayTaskId = await createTask(scheduleId, 'Дело сегодня', 10, 'Кухня');
    const yesterdayTaskId = await createTask(scheduleId, 'Дело вчера', 20, 'Ванная');
    const yesterday = shiftDays(appToday(), -1);

    await markTask(token, todayTaskId);
    await insertCompletion(yesterdayTaskId, userId, yesterday);

    const response = await request(app)
      .get('/api/analytics/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    const activity = response.body.activity as ActivityRow[];

    // Окно прежнее — 30 дней, последний день это сегодняшний день приложения.
    expect(activity).toHaveLength(30);
    expect(activity[activity.length - 1]?.date).toBe(appToday());

    const today = activity.find((row) => row.date === appToday());
    const past = activity.find((row) => row.date === yesterday);
    const older = activity.find((row) => row.date === shiftDays(appToday(), -2));

    expect(today).toMatchObject({
      tasks: 1,
      challenge_tasks: 0,
      habit_checkins: 0,
      minutes: 10,
    });
    expect(past).toMatchObject({ tasks: 1, minutes: 20 });
    expect(older).toMatchObject({ tasks: 0, minutes: 0 });

    // Итоги — сумма строк журнала: два дня, две отметки, 30 минут.
    expect(response.body.totals).toMatchObject({
      ownTasks: 2,
      challengeTasks: 0,
      habitCheckins: 0,
      activeHabits: 0,
      minutes: 30,
    });

    const rooms = response.body.rooms as Array<{ room: string; done: number }>;

    expect(rooms).toContainEqual({ room: 'Кухня', done: 1 });
    expect(rooms).toContainEqual({ room: 'Ванная', done: 1 });
  });

  it('в обзоре показывает сделанное по дням и не считает прежний флаг задачи', async () => {
    const { userId, scheduleId, token } = await createFixture();
    const todayTaskId = await createTask(scheduleId, 'Дело сегодня', 10, 'Кухня');
    const yesterdayTaskId = await createTask(scheduleId, 'Дело вчера', 20, 'Ванная');
    const yesterday = shiftDays(appToday(), -1);

    // Задача, закрытая до журнала: прежний флаг есть, строки журнала нет.
    const legacyId = await createTask(scheduleId, 'Дело с прежним флагом', 45, 'Спальня');

    await pool.query(
      'UPDATE tasks SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP WHERE id = $1',
      [legacyId]
    );

    await markTask(token, todayTaskId);
    await insertCompletion(yesterdayTaskId, userId, yesterday);

    const response = await request(app)
      .get('/api/analytics/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.period).toBe('all');

    // Отметка дня — строка журнала, поэтому «два дня, две отметки», а задача с
    // одним лишь флагом `is_completed` в статистику не попадает.
    expect(response.body.totals).toMatchObject({ tasks: 2, minutes: 30, days: 2 });
    expect(response.body.last7).toMatchObject({ tasks: 2, minutes: 30 });

    const history = response.body.history as Array<{
      title: string;
      date: string;
      minutes: number;
      room: string | null;
      kind: string;
    }>;

    expect(history).toHaveLength(2);
    expect(history.map((item) => item.date).sort()).toEqual([yesterday, appToday()].sort());
    expect(history.every((item) => item.kind === 'task')).toBe(true);
    expect(history.some((item) => item.title === 'Дело с прежним флагом')).toBe(false);

    expect(response.body.longest).toMatchObject({
      title: 'Дело вчера',
      minutes: 20,
      date: yesterday,
    });

    // Распределение по дням недели складывается из тех же двух отметок.
    const weekday = response.body.weekday as Array<{
      weekday: number;
      tasks: number;
      minutes: number;
    }>;

    expect(weekday).toHaveLength(7);
    expect(weekday.reduce((sum, day) => sum + day.tasks, 0)).toBe(2);
    expect(weekday.reduce((sum, day) => sum + day.minutes, 0)).toBe(30);
  });

  it('отдаёт отметки по дням в GET /api/analytics/tasks', async () => {
    const { userId, scheduleId, token } = await createFixture();
    const todayTaskId = await createTask(scheduleId, 'Дело сегодня', 5, 'Кухня');
    const yesterdayTaskId = await createTask(scheduleId, 'Дело вчера', 7, 'Ванная');
    const yesterday = shiftDays(appToday(), -1);

    await markTask(token, todayTaskId);
    await insertCompletion(yesterdayTaskId, userId, yesterday);

    const response = await request(app)
      .get('/api/analytics/tasks')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);

    /**
     * Дата приходит типом `date` (форма ответа прежняя), а JSON превращает её в
     * момент: `pg` разбирает дату в полночь **своего** пояса. Поэтому календарный
     * день читаем обратно в том же поясе процесса — тогда видно ровно тот день,
     * который лежит в журнале.
     */
    const dayOfDateColumn = (raw: string): string => {
      const moment = new Date(raw);
      const month = String(moment.getMonth() + 1).padStart(2, '0');
      const day = String(moment.getDate()).padStart(2, '0');
      return `${moment.getFullYear()}-${month}-${day}`;
    };

    const rows = (response.body as Array<{ date: string; count: number }>).map((row) => ({
      date: dayOfDateColumn(row.date),
      count: Number(row.count),
    }));

    expect(rows).toEqual([
      { date: yesterday, count: 1 },
      { date: appToday(), count: 1 },
    ]);
  });
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await pool
      .query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds])
      .catch(() => undefined);
  }
});
