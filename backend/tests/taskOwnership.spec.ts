import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db';
import { generateTokens } from '../auth';

/**
 * Владение расписанием при создании задачи.
 *
 * `user_id` в Postgres — число, а идентификатор в токене — строка. Строгое
 * сравнение `!==` считало владельца чужаком и отвечало 403, хотя токен подписан
 * правильно: в JWT идентификатор всегда строка, поэтому проверка обязана
 * сравнивать значения, а не типы. Здесь закрыт именно этот случай и заодно
 * проверено, что чужой по-прежнему получает отказ.
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
      `task-owner-spec-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
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
     VALUES ($1, $2, 'Проверка владения')
     RETURNING id`,
    [userId, title]
  );

  return schedule.rows[0].id;
};

describe.skipIf(!dbReady)('владение расписанием при создании задачи', () => {
  it('владелец со строковым id в токене создаёт задачу', async () => {
    const userId = await createUser();
    const scheduleId = await createSchedule(userId, 'QA владение');

    const response = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${generateTokens(String(userId)).accessToken}`)
      .send({ schedule_id: scheduleId, title: 'Проверить владение', frequency: 'once' });

    expect(response.status).toBe(201);
  });

  it('чужой пользователь получает 403', async () => {
    const ownerId = await createUser();
    const strangerId = await createUser();
    const scheduleId = await createSchedule(ownerId, 'QA чужое расписание');

    const response = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${generateTokens(String(strangerId)).accessToken}`)
      .send({ schedule_id: scheduleId, title: 'Чужая задача', frequency: 'once' });

    expect(response.status).toBe(403);
  });
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await pool
      .query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds])
      .catch(() => undefined);
  }
});
