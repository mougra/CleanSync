import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db';
import { generateTokens } from '../auth';
import { DEFAULT_TASK_SOURCE, normalizeTaskTitle } from '../services/defaultTasks';

/**
 * Удаление и возврат задачи.
 *
 * Удаление возвращает копию самой задачи (`task`), а `POST /api/tasks/restore`
 * кладёт её назад в то же расписание — так интерфейс показывает «Вернуть» на
 * несколько секунд, не запрашивая задачу отдельно.
 *
 * Отдельно проверяется память об отказах (миграция 0017): удаление
 * сгенерированной задачи запоминает её название, `syncDefaultTasks` такие
 * названия пропускает, а восстановление пометку снимает — иначе возвращённое
 * дело снова исчезло бы при следующей пересборке набора.
 *
 * Тесты работают с настоящей базой, как CI; без базы блок пропускается.
 */

const dbReady = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch(() => false);

const createdUserIds: number[] = [];

const createUser = async (): Promise<number> => {
  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password)
     VALUES ($1, $2)
     RETURNING id`,
    [
      `task-restore-spec-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      'test-password-hash',
    ]
  );

  const userId = user.rows[0].id;
  createdUserIds.push(userId);

  return userId;
};

const createSchedule = async (userId: number, title: string): Promise<number> => {
  const schedule = await pool.query<{ id: number }>(
    `INSERT INTO schedules (user_id, title, description)
     VALUES ($1, $2, 'Проверка удаления и возврата')
     RETURNING id`,
    [userId, title]
  );

  return schedule.rows[0].id;
};

/** Задача в расписании: по умолчанию своя (без `source`), как её создаёт человек. */
const createTask = async (
  scheduleId: number,
  title: string,
  extra: { source?: string; is_completed?: boolean; frequency?: string } = {}
): Promise<number> => {
  const task = await pool.query<{ id: number }>(
    `INSERT INTO tasks (schedule_id, title, room, estimated_minutes, frequency, interval_count, source, is_completed)
     VALUES ($1, $2, 'Кухня', 15, $3, 1, $4, $5)
     RETURNING id`,
    [scheduleId, title, extra.frequency ?? 'weekly', extra.source ?? null, extra.is_completed ?? false]
  );

  return task.rows[0].id;
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const deleteTask = (token: string, id: number) =>
  request(app).delete(`/api/tasks/${id}`).set(auth(token));

const restoreTask = (token: string, body: Record<string, unknown>) =>
  request(app).post('/api/tasks/restore').set(auth(token)).send(body);

/** Есть ли название в списке отказов пользователя (сравнение нормализованное). */
const isDismissed = async (userId: number, title: string): Promise<boolean> => {
  const result = await pool.query<{ title: string }>(
    'SELECT title FROM dismissed_default_tasks WHERE user_id = $1',
    [userId]
  );

  return result.rows.some((row) => normalizeTaskTitle(row.title) === normalizeTaskTitle(title));
};

describe.skipIf(!dbReady)('DELETE /api/tasks/:id: ответ отдаёт удалённую задачу', () => {
  it('своя задача удаляется без отказа, а payload содержит все поля для возврата', async () => {
    const userId = await createUser();
    const scheduleId = await createSchedule(userId, 'Личные дела');
    const taskId = await createTask(scheduleId, 'Помыть окна');
    const token = generateTokens(String(userId)).accessToken;

    const response = await deleteTask(token, taskId);

    expect(response.status).toBe(200);
    expect(response.body.deleted).toBe(true);
    expect(response.body.id).toBe(taskId);
    expect(response.body.dismissed).toBe(false);

    expect(response.body.task).toMatchObject({
      schedule_id: scheduleId,
      title: 'Помыть окна',
      room: 'Кухня',
      frequency: 'weekly',
      interval_count: 1,
      estimated_minutes: 15,
      source: null,
      is_completed: false,
    });

    // Поля возврата перечислены явно: клиент отправляет это тело как есть, и
    // пропажа любого из них сломала бы восстановление молча.
    for (const field of [
      'schedule_id',
      'title',
      'room',
      'frequency',
      'interval_count',
      'day_of_week',
      'day_of_month',
      'due_date',
      'time',
      'estimated_minutes',
      'source',
      'is_completed',
      'completed_at',
    ]) {
      expect(response.body.task).toHaveProperty(field);
    }

    // Чужое назначение в ответе не нужно: возврат им не занимается.
    expect(Object.keys(response.body.task).sort()).toEqual(
      [
        'completed_at',
        'day_of_month',
        'day_of_week',
        'due_date',
        'estimated_minutes',
        'frequency',
        'id',
        'interval_count',
        'is_completed',
        'room',
        'schedule_id',
        'source',
        'time',
        'title',
      ].sort()
    );

    // Своего удаления в списке отказов нет: его никто и не воскрешал бы.
    expect(await isDismissed(userId, 'Помыть окна')).toBe(false);

    const stored = await pool.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
    expect(stored.rows).toHaveLength(0);
  });

  it('сгенерированная задача помечается как отказ', async () => {
    const userId = await createUser();
    const scheduleId = await createSchedule(userId, 'Мои задачи');
    const taskId = await createTask(scheduleId, 'Протереть пыль', { source: DEFAULT_TASK_SOURCE });
    const token = generateTokens(String(userId)).accessToken;

    const response = await deleteTask(token, taskId);

    expect(response.status).toBe(200);
    expect(response.body.dismissed).toBe(true);
    expect(response.body.task.source).toBe(DEFAULT_TASK_SOURCE);
    expect(await isDismissed(userId, 'Протереть пыль')).toBe(true);
  });

  it('чужую задачу удалить нельзя, payload не отдаётся', async () => {
    const ownerId = await createUser();
    const strangerId = await createUser();
    const scheduleId = await createSchedule(ownerId, 'Чужое расписание');
    const taskId = await createTask(scheduleId, 'Чужая задача');

    const response = await deleteTask(generateTokens(String(strangerId)).accessToken, taskId);

    expect(response.status).toBe(403);
    expect(response.body.task).toBeUndefined();

    const stored = await pool.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
    expect(stored.rows).toHaveLength(1);
  });
});

describe.skipIf(!dbReady)('POST /api/tasks/restore: задача возвращается на место', () => {
  it('своя задача возвращается в то же расписание с прежними полями', async () => {
    const userId = await createUser();
    const scheduleId = await createSchedule(userId, 'Личные дела');
    const taskId = await createTask(scheduleId, 'Разобрать шкаф');
    const token = generateTokens(String(userId)).accessToken;

    const removed = await deleteTask(token, taskId);
    expect(removed.status).toBe(200);

    const response = await restoreTask(token, removed.body.task);

    expect(response.status).toBe(201);
    expect(response.body.restored).toBe(true);
    // Свой отказ не запоминается, значит и снимать нечего.
    expect(response.body.restoredFromDismissal).toBe(false);
    expect(response.body.task).toMatchObject({
      id: expect.any(Number),
      schedule_id: scheduleId,
      title: 'Разобрать шкаф',
      room: 'Кухня',
      frequency: 'weekly',
      interval_count: 1,
      estimated_minutes: 15,
      source: null,
      is_completed: false,
    });

    // Задача вернулась именно в своё расписание, ровно одна и без записи об отказе.
    const stored = await pool.query<{ schedule_id: number; title: string }>(
      'SELECT schedule_id, title FROM tasks WHERE id = $1',
      [response.body.task.id]
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].schedule_id).toBe(scheduleId);
    expect(await isDismissed(userId, 'Разобрать шкаф')).toBe(false);
  });

  it('сгенерированная задача возвращается со снятием отказа и больше не пропускается набором', async () => {
    const userId = await createUser();
    const scheduleId = await createSchedule(userId, 'Мои задачи');
    const title = 'Вымыть холодильник';
    const taskId = await createTask(scheduleId, title, { source: DEFAULT_TASK_SOURCE });
    const token = generateTokens(String(userId)).accessToken;

    const removed = await deleteTask(token, taskId);
    expect(removed.body.dismissed).toBe(true);
    expect(await isDismissed(userId, title)).toBe(true);

    const response = await restoreTask(token, removed.body.task);

    expect(response.status).toBe(201);
    expect(response.body.restoredFromDismissal).toBe(true);
    expect(await isDismissed(userId, title)).toBe(false);

    // Пометка снята — значит набор снова видит это название как своё, а не
    // пропускает его: строка «отказа» пережила бы своё действие.
    const dismissedCount = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM dismissed_default_tasks WHERE user_id = $1',
      [userId]
    );
    expect(dismissedCount.rows[0].total).toBe(0);
  });
});

describe.skipIf(!dbReady)('POST /api/tasks/restore: проверки', () => {
  it('без schedule_id и title отвечает 400', async () => {
    const userId = await createUser();
    const token = generateTokens(String(userId)).accessToken;

    expect((await restoreTask(token, { title: 'Что-то' })).status).toBe(400);
    expect((await restoreTask(token, { schedule_id: 1 })).status).toBe(400);
    expect((await restoreTask(token, {})).status).toBe(400);
  });

  it('несуществующее расписание отвечает 404', async () => {
    const userId = await createUser();
    const token = generateTokens(String(userId)).accessToken;

    const response = await restoreTask(token, { schedule_id: 2_000_000_000, title: 'Куда-нибудь' });

    expect(response.status).toBe(404);
  });

  it('чужое расписание отвечает 403 и ничего не создаёт', async () => {
    const ownerId = await createUser();
    const strangerId = await createUser();
    const scheduleId = await createSchedule(ownerId, 'Чужое расписание');
    const taskId = await createTask(scheduleId, 'Чужое дело');

    const ownerToken = generateTokens(String(ownerId)).accessToken;
    const removed = await deleteTask(ownerToken, taskId);
    expect(removed.status).toBe(200);

    const response = await restoreTask(
      generateTokens(String(strangerId)).accessToken,
      removed.body.task
    );

    expect(response.status).toBe(403);

    const stored = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM tasks WHERE schedule_id = $1',
      [scheduleId]
    );
    expect(stored.rows[0].total).toBe(0);
  });
});

describe.skipIf(!dbReady)('POST /api/tasks/restore: снятие отказа видно сборке набора', () => {
  /**
   * Полный круг на настоящем наборе: анкета пройдена, задача пришла из
   * `home_profile_defaults`. Проверяется не только строка в таблице отказов, но и
   * результат сборки: пока отказ стоит — название пропускается (`myTasks.dismissed`),
   * после возврата — снова попадает в набор. Иначе «Вернуть» возвращало бы задачу
   * на экран до первой же пересборки плана.
   */
  it('после возврата пересборка больше не пропускает задачу', async () => {
    const userId = await createUser();
    const token = generateTokens(String(userId)).accessToken;

    const completed = await request(app)
      .put('/api/home-profile')
      .set(auth(token))
      .send({ complete: true });
    expect(completed.status).toBe(200);

    const plan = await request(app).post('/api/home-profile/plan').set(auth(token)).send({});
    expect(plan.status).toBe(200);

    const scheduleId = plan.body.schedule.id as number;
    const victim = (
      await pool.query<{ id: number; title: string }>(
        'SELECT id, title FROM tasks WHERE schedule_id = $1 ORDER BY id LIMIT 1',
        [scheduleId]
      )
    ).rows[0];

    const removed = await deleteTask(token, victim.id);
    expect(removed.status).toBe(200);
    expect(removed.body.dismissed).toBe(true);
    expect(await isDismissed(userId, victim.title)).toBe(true);

    const whileDismissed = await request(app).post('/api/home-profile/plan').set(auth(token)).send({});
    expect(whileDismissed.status).toBe(200);
    expect(whileDismissed.body.myTasks.dismissed).toBeGreaterThan(0);

    const restored = await restoreTask(token, removed.body.task);

    expect(restored.status).toBe(201);
    expect(restored.body.restoredFromDismissal).toBe(true);
    expect(await isDismissed(userId, victim.title)).toBe(false);

    const afterRestore = await request(app).post('/api/home-profile/plan').set(auth(token)).send({});

    expect(afterRestore.status).toBe(200);
    expect(afterRestore.body.myTasks.dismissed).toBe(0);

    const titles = (
      await pool.query<{ title: string }>('SELECT title FROM tasks WHERE schedule_id = $1', [scheduleId])
    ).rows.map((row) => normalizeTaskTitle(row.title));
    expect(titles.filter((title) => title === normalizeTaskTitle(victim.title))).toHaveLength(1);
  });
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    // Расписания, задачи и отказы уходят каскадом вместе с пользователем.
    await pool
      .query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds])
      .catch(() => undefined);
  }
});
