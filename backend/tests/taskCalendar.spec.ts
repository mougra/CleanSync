import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db';
import { generateTokens } from '../auth';

/**
 * Календарь задач: `GET /api/tasks/calendar?from=…&to=…`.
 *
 * Календарь — это навигация по дням, поэтому он обязан считать дни ровно так же,
 * как «План на сегодня»: иначе задача, видимая в плане, пропала бы из календаря
 * или наоборот. Правила периодичности живут в одном помощнике `tasksDueOn`, и
 * здесь проверяется именно его поведение снаружи — через HTTP.
 *
 * Даты в ответе трактуются как календарные (UTC-полночь): день в ответе обязан
 * совпадать с днём в запросе. Диапазон шире 42 дней — осознанная ошибка клиента
 * (400), а не тихая обрезка: молча укороченный ответ показал бы не те дни.
 *
 * Тесты работают с настоящей базой, как CI; без базы блок пропускается.
 */

const dbReady = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch(() => false);

const createdUserIds: number[] = [];

/** Сдвиг даты на N суток от сегодняшнего UTC-дня: так же считает и сам эндпоинт. */
const shiftDays = (days: number): Date => {
  const today = new Date();
  const base = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
};

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

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
      `task-calendar-spec-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      'test-password-hash',
    ]
  );

  const userId = user.rows[0].id;
  createdUserIds.push(userId);

  const schedule = await pool.query<{ id: number }>(
    `INSERT INTO schedules (user_id, title, description)
     VALUES ($1, 'Календарь QA', 'Проверка календаря')
     RETURNING id`,
    [userId]
  );

  return { userId, scheduleId: schedule.rows[0].id, token: generateTokens(String(userId)).accessToken };
};

/** Задача с явной периодичностью: тот же набор колонок, что заполняет `POST /api/tasks`. */
const createTask = async (
  scheduleId: number,
  fields: {
    title: string;
    frequency: string;
    dayOfWeek?: number | null;
    dayOfMonth?: number | null;
    dueDate?: string | null;
    estimatedMinutes?: number;
    room?: string | null;
    intervalCount?: number;
  }
): Promise<number> => {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO tasks
       (schedule_id, title, frequency, day_of_week, day_of_month, due_date, estimated_minutes, room, interval_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      scheduleId,
      fields.title,
      fields.frequency,
      fields.dayOfWeek ?? null,
      fields.dayOfMonth ?? null,
      fields.dueDate ?? null,
      fields.estimatedMinutes ?? 0,
      fields.room ?? null,
      fields.intervalCount ?? 1,
    ]
  );

  return result.rows[0].id;
};

interface CalendarTask {
  id: number;
  title: string;
  room: string | null;
  estimated_minutes: number | null;
  is_completed: boolean;
  frequency: string | null;
  interval_count: number | null;
}

interface CalendarDay {
  date: string;
  weekday: number;
  total_tasks: number;
  completed_tasks: number;
  total_minutes: number;
  completed_minutes: number;
  tasks: CalendarTask[];
}

interface CalendarResponse {
  from: string;
  to: string;
  days: CalendarDay[];
}

const fetchCalendar = (token: string, from: string, to: string) =>
  request(app)
    .get('/api/tasks/calendar')
    .query({ from, to })
    .set('Authorization', `Bearer ${token}`);

describe.skipIf(!dbReady)('календарь задач по диапазону дат', () => {
  it('без авторизации отвечает 401', async () => {
    const response = await request(app)
      .get('/api/tasks/calendar')
      .query({ from: isoDate(shiftDays(-1)), to: isoDate(shiftDays(1)) });

    expect(response.status).toBe(401);
  });

  it('отдаёт каждый день диапазона по порядку и с полями ответа', async () => {
    const { token } = await createFixture();
    const from = shiftDays(-3);
    const to = shiftDays(3);

    const response = await fetchCalendar(token, isoDate(from), isoDate(to));

    expect(response.status).toBe(200);

    const body = response.body as CalendarResponse;
    expect(body.from).toBe(isoDate(from));
    expect(body.to).toBe(isoDate(to));
    expect(body.days).toHaveLength(7);
    expect(body.days.map((day) => day.date)).toEqual([
      isoDate(shiftDays(-3)),
      isoDate(shiftDays(-2)),
      isoDate(shiftDays(-1)),
      isoDate(shiftDays(0)),
      isoDate(shiftDays(1)),
      isoDate(shiftDays(2)),
      isoDate(shiftDays(3)),
    ]);

    for (const [index, day] of body.days.entries()) {
      const expected = shiftDays(-3 + index);

      expect(day.weekday).toBe(expected.getUTCDay());
      expect(day.total_tasks).toBe(day.tasks.length);
      expect(day.completed_tasks).toBe(day.tasks.filter((task) => task.is_completed).length);
      expect(day.total_minutes).toBe(
        day.tasks.reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0)
      );
      expect(day.completed_minutes).toBe(
        day.tasks
          .filter((task) => task.is_completed)
          .reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0)
      );
    }
  });

  it('отдаёт прошедший день с тем, что было запланировано по периодичности', async () => {
    const { scheduleId, token } = await createFixture();
    const yesterday = shiftDays(-1);

    const dailyId = await createTask(scheduleId, {
      title: 'Прошедшее ежедневное дело',
      frequency: 'daily',
      dueDate: isoDate(shiftDays(-30)),
      estimatedMinutes: 12,
      room: 'Кухня',
    });

    const weeklyId = await createTask(scheduleId, {
      title: `Прошедшее недельное дело (${yesterday.getUTCDay()})`,
      frequency: 'weekly',
      dayOfWeek: yesterday.getUTCDay(),
      estimatedMinutes: 20,
      room: 'Ванная',
    });

    // Задача, которая в прошлом не стояла вовсе: её в прошедших днях быть не должно.
    const futureId = await createTask(scheduleId, {
      title: 'Дело, начатое завтра',
      frequency: 'once',
      dueDate: isoDate(shiftDays(1)),
      estimatedMinutes: 5,
    });

    // Отметка задним числом не запрещена на уровне API, но и в серию не идёт;
    // здесь важно, что закрытая задача остаётся видна в том дне, когда была.
    await request(app)
      .put(`/api/tasks/${dailyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_completed: true });

    const response = await fetchCalendar(token, isoDate(yesterday), isoDate(shiftDays(1)));

    expect(response.status).toBe(200);

    const body = response.body as CalendarResponse;
    const past = body.days.find((day) => day.date === isoDate(yesterday));

    expect(past).toBeDefined();
    expect(past?.total_tasks).toBe(2);
    expect(past?.completed_tasks).toBe(1);
    expect(past?.total_minutes).toBe(32);
    expect(past?.completed_minutes).toBe(12);

    const ids = past?.tasks.map((task) => task.id) ?? [];
    expect(ids).toContain(dailyId);
    expect(ids).toContain(weeklyId);
    expect(ids).not.toContain(futureId);

    const daily = past?.tasks.find((task) => task.id === dailyId);
    expect(daily).toMatchObject({
      title: 'Прошедшее ежедневное дело',
      room: 'Кухня',
      estimated_minutes: 12,
      is_completed: true,
      frequency: 'daily',
      interval_count: 1,
    });

    const weekly = past?.tasks.find((task) => task.id === weeklyId);
    expect(weekly).toMatchObject({
      room: 'Ванная',
      estimated_minutes: 20,
      is_completed: false,
      frequency: 'weekly',
    });

    // Будущий день: завтра попадают «разовое дело на завтра» и то же ежедневное
    // дело из прошлого (due_date 30 дней назад), поэтому счётчики такие.
    //
    // Важная деталь: `is_completed` у периодической задачи один на всю задачу, а
    // не на каждую дату, поэтому закрытое ежедневное дело видно закрытым и в
    // будущем дне. Это ограничение модели, а не ошибка выборки: интерфейс из-за
    // него не показывает «выполнено 0» у будущих дней — он вообще прячет факт,
    // пока день не наступил.
    const future = body.days.find((day) => day.date === isoDate(shiftDays(1)));

    expect(future).toBeDefined();
    expect(future?.tasks.map((task) => task.id)).toEqual([futureId, dailyId]);
    expect(future?.completed_tasks).toBe(1);
    expect(future?.completed_minutes).toBe(12);
    expect(future?.total_minutes).toBe(17);

    const futureOnly = future?.tasks.find((task) => task.id === futureId);
    expect(futureOnly?.is_completed).toBe(false);
  });

  it('раскладывает повтор по дням недели, а не по всем дням подряд', async () => {
    const { scheduleId, token } = await createFixture();
    const from = shiftDays(0);
    const to = shiftDays(13);

    const weekday = from.getUTCDay();
    const weeklyId = await createTask(scheduleId, {
      title: `Еженедельное дело (${weekday})`,
      frequency: 'weekly',
      dayOfWeek: weekday,
      estimatedMinutes: 15,
    });

    const dailyId = await createTask(scheduleId, {
      title: 'Ежедневное дело календаря',
      frequency: 'daily',
      estimatedMinutes: 10,
    });

    const response = await fetchCalendar(token, isoDate(from), isoDate(to));

    expect(response.status).toBe(200);

    const body = response.body as CalendarResponse;
    expect(body.days).toHaveLength(14);

    for (const day of body.days) {
      const ids = day.tasks.map((task) => task.id);

      expect(ids).toContain(dailyId);
      expect(ids.includes(weeklyId)).toBe(day.weekday === weekday);
    }
  });

  it('возвращает 400 на несуществующую дату', async () => {
    const { token } = await createFixture();

    const response = await fetchCalendar(token, '2025-02-31', '2025-03-05');

    expect(response.status).toBe(400);
  });

  it('возвращает 400 на дату в неверном формате', async () => {
    const { token } = await createFixture();

    const slashy = await fetchCalendar(token, '05/03/2025', '2025-03-05');
    const garbage = await fetchCalendar(token, 'not-a-date', '2025-03-05');

    expect(slashy.status).toBe(400);
    expect(garbage.status).toBe(400);
  });

  it('возвращает 400, если начало позже конца', async () => {
    const { token } = await createFixture();

    const response = await fetchCalendar(token, isoDate(shiftDays(2)), isoDate(shiftDays(-2)));

    expect(response.status).toBe(400);
  });

  it('возвращает 400, если диапазон шире 42 дней, и принимает ровно 42', async () => {
    const { token } = await createFixture();

    const tooWide = await fetchCalendar(token, isoDate(shiftDays(0)), isoDate(shiftDays(42)));
    const widest = await fetchCalendar(token, isoDate(shiftDays(0)), isoDate(shiftDays(41)));

    expect(tooWide.status).toBe(400);
    expect(tooWide.body.max_days).toBe(42);
    expect(widest.status).toBe(200);
    expect((widest.body as CalendarResponse).days).toHaveLength(42);
  });
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await pool
      .query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds])
      .catch(() => undefined);
  }
});
