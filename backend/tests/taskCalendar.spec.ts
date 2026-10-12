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
 * Поле `is_completed` в ответе — результат **дня**, а не задачи (миграция 0018,
 * таблица `task_completions`): галочка, поставленная сегодня, не видна вчера и
 * завтра, у прошлых дней остаётся свой результат, а разовое дело, сделанное
 * однажды, остаётся сделанным. Проверки ниже держат именно это правило: раньше
 * `is_completed` был свойством задачи, и закрытое сегодня дело показывалось
 * закрытым во всех днях диапазона.
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
  });  it('отдаёт каждый день диапазона по порядку и с полями ответа', async () => {
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
    const { userId, scheduleId, token } = await createFixture();
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

    /**
     * Отметка «вчера» ставится прямо в журнал: у результата дня своя дата, и
     * задним числом его через API не поставить (PUT отмечает только сегодня).
     * Здесь важно, что закрытое вчера дело видно закрытым ровно вчера.
     */
    await pool.query(
      'INSERT INTO task_completions (task_id, completed_on, completed_by) VALUES ($1, $2, $3)',
      [dailyId, isoDate(yesterday), userId]
    );

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

    /**
     * Завтра: вчерашняя отметка туда не переезжает — у каждого дня свой
     * результат (миграция 0018). Видны только дела, попадающие на завтра:
     * ежедневное (due_date 30 дней назад) и разовое на завтра.
     */
    const future = body.days.find((day) => day.date === isoDate(shiftDays(1)));

    expect(future).toBeDefined();
    // Порядок задач в дне задаёт `time`, а у этих задач времени нет: сравниваем
    // состав, а не последовательность.
    expect([...(future?.tasks.map((task) => task.id) ?? [])].sort((left, right) => left - right)).toEqual(
      [futureId, dailyId].sort((left, right) => left - right)
    );
    expect(future?.completed_tasks).toBe(0);
    expect(future?.completed_minutes).toBe(0);
    expect(future?.total_minutes).toBe(17);

    const futureOnly = future?.tasks.find((task) => task.id === futureId);
    expect(futureOnly?.is_completed).toBe(false);

    // Сегодня закрытого вчера дела тоже нет: отметка стоит только на вчера.
    const today = body.days.find((day) => day.date === isoDate(shiftDays(0)));
    const todayDaily = today?.tasks.find((task) => task.id === dailyId);

    expect(todayDaily?.is_completed).toBe(false);
  });

  it('отметка сегодня закрывает ровно сегодня и обновляет прежние колонки задачи', async () => {
    const { userId, scheduleId, token } = await createFixture();

    const dailyId = await createTask(scheduleId, {
      title: 'Ежедневное дело с отметкой дня',
      frequency: 'daily',
      estimatedMinutes: 10,
      room: 'Кухня',
    });

    const marked = await request(app)
      .put(`/api/tasks/${dailyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_completed: true });

    expect(marked.status).toBe(200);
    expect(marked.body.is_completed).toBe(true);

    // Отметка легла на сегодняшний день в UTC — тот же, которым считает календарь.
    const journal = await pool.query<{ completed_on: string; completed_by: number }>(
      'SELECT completed_on::text AS completed_on, completed_by FROM task_completions WHERE task_id = $1',
      [dailyId]
    );

    expect(journal.rows).toHaveLength(1);
    expect(journal.rows[0].completed_on).toBe(isoDate(shiftDays(0)));
    expect(Number(journal.rows[0].completed_by)).toBe(userId);

    /**
     * Прежние колонки задачи продолжают обновляться: на `is_completed`,
     * `completed_at` и `completed_by` держатся серия, достижения, статистика и
     * семейный режим (services/streak.ts, services/achievementManager.ts,
     * routes/analytics.ts, routes/household.ts).
     */
    const legacy = await pool.query<{
      is_completed: boolean;
      completed_at: string | null;
      completed_by: number | null;
    }>('SELECT is_completed, completed_at::text AS completed_at, completed_by FROM tasks WHERE id = $1', [
      dailyId,
    ]);

    expect(legacy.rows[0].is_completed).toBe(true);
    expect(legacy.rows[0].completed_at).not.toBeNull();
    expect(Number(legacy.rows[0].completed_by)).toBe(userId);

    const body = (
      await fetchCalendar(token, isoDate(shiftDays(-1)), isoDate(shiftDays(1)))
    ).body as CalendarResponse;

    const completedOn = (date: Date) =>
      body.days.find((day) => day.date === isoDate(date))?.tasks.find((task) => task.id === dailyId)
        ?.is_completed;

    expect(completedOn(shiftDays(0))).toBe(true);
    expect(completedOn(shiftDays(-1))).toBe(false);
    expect(completedOn(shiftDays(1))).toBe(false);

    const past = body.days.find((day) => day.date === isoDate(shiftDays(-1)));
    const future = body.days.find((day) => day.date === isoDate(shiftDays(1)));

    expect(past?.completed_tasks).toBe(0);
    expect(future?.completed_tasks).toBe(0);

    // Снятие отметки убирает ровно сегодняшнюю строку журнала и сбрасывает флаг.
    const unmarked = await request(app)
      .put(`/api/tasks/${dailyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_completed: false });

    expect(unmarked.status).toBe(200);
    expect(unmarked.body.is_completed).toBe(false);

    const afterUnmark = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM task_completions WHERE task_id = $1',
      [dailyId]
    );

    expect(afterUnmark.rows[0].total).toBe(0);

    const legacyAfter = await pool.query<{
      is_completed: boolean;
      completed_at: string | null;
      completed_by: number | null;
    }>('SELECT is_completed, completed_at::text AS completed_at, completed_by FROM tasks WHERE id = $1', [
      dailyId,
    ]);

    expect(legacyAfter.rows[0].is_completed).toBe(false);
    expect(legacyAfter.rows[0].completed_at).toBeNull();
    expect(legacyAfter.rows[0].completed_by).toBeNull();

    const reopened = (
      await fetchCalendar(token, isoDate(shiftDays(0)), isoDate(shiftDays(0)))
    ).body as CalendarResponse;

    expect(reopened.days[0].completed_tasks).toBe(0);
  });

  it('разовое дело остаётся сделанным, а прошлые дни не переписываются снятием', async () => {
    const { userId, scheduleId, token } = await createFixture();
    const yesterday = shiftDays(-1);
    const twoDaysAgo = shiftDays(-2);

    // Разовое дело, закрытое до журнала: прежний флаг задачи — единственный след.
    const legacyOnce = await createTask(scheduleId, {
      title: 'Разовое дело с прежним флагом',
      frequency: 'once',
      dueDate: isoDate(yesterday),
      estimatedMinutes: 15,
    });

    await pool.query('UPDATE tasks SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP WHERE id = $1', [
      legacyOnce,
    ]);

    // Разовое дело, закрытое отметкой на свою дату.
    const markedOnce = await createTask(scheduleId, {
      title: 'Разовое дело с отметкой',
      frequency: 'once',
      dueDate: isoDate(twoDaysAgo),
      estimatedMinutes: 8,
    });

    await pool.query(
      'INSERT INTO task_completions (task_id, completed_on, completed_by) VALUES ($1, $2, $3)',
      [markedOnce, isoDate(twoDaysAgo), userId]
    );

    // Ежедневное дело с отметкой два дня назад: у него отметка ровно того дня.
    const dailyId = await createTask(scheduleId, {
      title: 'Ежедневное дело двухдневной давности',
      frequency: 'daily',
      estimatedMinutes: 5,
    });

    await pool.query(
      'INSERT INTO task_completions (task_id, completed_on, completed_by) VALUES ($1, $2, $3)',
      [dailyId, isoDate(twoDaysAgo), userId]
    );

    const body = (
      await fetchCalendar(token, isoDate(twoDaysAgo), isoDate(shiftDays(0)))
    ).body as CalendarResponse;

    const past = body.days.find((day) => day.date === isoDate(twoDaysAgo));
    const yesterdayDay = body.days.find((day) => day.date === isoDate(yesterday));

    expect(past?.tasks.find((task) => task.id === markedOnce)?.is_completed).toBe(true);
    expect(past?.tasks.find((task) => task.id === dailyId)?.is_completed).toBe(true);
    expect(yesterdayDay?.tasks.find((task) => task.id === legacyOnce)?.is_completed).toBe(true);

    // «Сделано однажды — сделано»: у ежедневного дела прошлый день остаётся
    // закрытым даже после снятия сегодняшней отметки — снимается только сегодня.
    await request(app)
      .put(`/api/tasks/${dailyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_completed: false });

    const afterUnmark = (
      await fetchCalendar(token, isoDate(twoDaysAgo), isoDate(twoDaysAgo))
    ).body as CalendarResponse;

    expect(afterUnmark.days[0].tasks.find((task) => task.id === dailyId)?.is_completed).toBe(true);
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

  it('«План на сегодня» отвечает прежней формой и считает результат дня', async () => {
    const { userId, scheduleId, token } = await createFixture();
    const yesterday = shiftDays(-1);

    const dailyId = await createTask(scheduleId, {
      title: 'Ежедневное дело для «Сегодня»',
      frequency: 'daily',
      estimatedMinutes: 9,
      room: 'Кухня',
    });

    // Вчерашняя отметка: сегодня она не должна закрывать дело.
    await pool.query(
      'INSERT INTO task_completions (task_id, completed_on, completed_by) VALUES ($1, $2, $3)',
      [dailyId, isoDate(yesterday), userId]
    );

    const before = await request(app)
      .get('/api/tasks/today')
      .set('Authorization', `Bearer ${token}`);

    expect(before.status).toBe(200);

    // Форма ответа прежняя: конверт и сводка те же, признак дня не протекает
    // наружу отдельным полем.
    expect(Object.keys(before.body).sort()).toEqual(['summary', 'tasks']);
    expect(Object.keys(before.body.summary).sort()).toEqual([
      'completed_tasks',
      'progress',
      'remaining_time',
      'total_estimated_time',
      'total_tasks',
    ]);

    const tasksOf = (body: { tasks: Record<string, CalendarTask[]> }): CalendarTask[] =>
      Object.values(body.tasks).flat();

    const beforeTask = tasksOf(before.body as { tasks: Record<string, CalendarTask[]> }).find(
      (task) => task.id === dailyId
    );

    expect(beforeTask?.is_completed).toBe(false);
    expect(beforeTask).not.toHaveProperty('completed_for_day');
    expect(before.body.summary.completed_tasks).toBe(0);

    await request(app)
      .put(`/api/tasks/${dailyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_completed: true });

    const after = await request(app)
      .get('/api/tasks/today')
      .set('Authorization', `Bearer ${token}`);

    const afterTask = tasksOf(after.body as { tasks: Record<string, CalendarTask[]> }).find(
      (task) => task.id === dailyId
    );

    expect(afterTask?.is_completed).toBe(true);
    expect(after.body.summary.completed_tasks).toBe(1);
    expect(after.body.summary.progress).toBeGreaterThan(0);
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

describe.skipIf(!dbReady)('журнал отметок по дням (миграция 0018)', () => {
  it('таблица есть, и повторная отметка того же дня не создаёт вторую строку', async () => {
    const { userId, scheduleId } = await createFixture();
    const taskId = await createTask(scheduleId, {
      title: 'Дело с отметкой дня',
      frequency: 'daily',
      estimatedMinutes: 5,
    });

    const table = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'task_completions'`
    );

    expect(table.rows).toHaveLength(1);

    const insert = `INSERT INTO task_completions (task_id, completed_on, completed_by)
                    VALUES ($1::int, $2::date, $3::int)`;

    await pool.query(insert, [taskId, isoDate(shiftDays(0)), userId]);

    // Ключ (task_id, completed_on): одна отметка на дело в день, иначе результат
    // дня считался бы дважды, а снятие отметки удаляло бы только одну строку.
    await expect(
      pool.query(insert, [taskId, isoDate(shiftDays(0)), userId])
    ).rejects.toThrow(/duplicate key|уже существует|unique/i);

    // Так же пишет PUT: повторная отметка обновляет автора, а не плодит строку.
    await pool.query(
      `INSERT INTO task_completions (task_id, completed_on, completed_by)
       VALUES ($1::int, $2::date, $3::int)
       ON CONFLICT (task_id, completed_on)
       DO UPDATE SET completed_by = EXCLUDED.completed_by`,
      [taskId, isoDate(shiftDays(0)), userId]
    );

    const rows = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM task_completions WHERE task_id = $1',
      [taskId]
    );

    expect(rows.rows[0].total).toBe(1);

    // Отметки другого дня живут рядом: у каждого дня свой результат.
    await pool.query(insert, [taskId, isoDate(shiftDays(-1)), userId]);

    const both = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM task_completions WHERE task_id = $1',
      [taskId]
    );

    expect(both.rows[0].total).toBe(2);
  });
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await pool
      .query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds])
      .catch(() => undefined);
  }
});
