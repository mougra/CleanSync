import { afterAll, describe, expect, it } from 'vitest';
import pool from '../db';
import { checkAndAwardAchievements, collectMetrics } from '../services/achievementManager';
import { appToday } from '../services/appTime';

/**
 * Достижения считают сделанное по журналу отметок (миграция 0018).
 *
 * Раньше «сделано N дел» складывалось из задач с флагом `tasks.is_completed`, и
 * повторяющееся дело давало ровно одно дело за всю жизнь, а снятая галочка
 * вычитала его из истории. Теперь метрика — строки `task_completions`: каждый
 * закрытый пункт в свой день, поэтому пять дней ежедневного дела — это пять дел.
 *
 * Пороги достижений не менялись: проверяются те же определения из сида
 * (`first_step` = 1, `getting_started` = 5), поэтому «ослабления» условия нет —
 * меняется только источник подсчёта. Тесты работают с настоящей базой, как CI;
 * без базы блок пропускается.
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

const createUser = async (prefix: string): Promise<number> => {
  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password)
     VALUES ($1, $2)
     RETURNING id`,
    [
      `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      'test-password-hash',
    ]
  );

  createdUserIds.push(user.rows[0].id);

  return user.rows[0].id;
};

const createScheduleAndTask = async (userId: number, title: string): Promise<number> => {
  const schedule = await pool.query<{ id: number }>(
    `INSERT INTO schedules (user_id, title) VALUES ($1, 'Достижения QA') RETURNING id`,
    [userId]
  );

  const task = await pool.query<{ id: number }>(
    `INSERT INTO tasks (schedule_id, title, frequency, estimated_minutes)
     VALUES ($1, $2, 'daily', 10)
     RETURNING id`,
    [schedule.rows[0].id, title]
  );

  return task.rows[0].id;
};

const insertCompletion = (taskId: number, userId: number, day: string) =>
  pool.query(
    `INSERT INTO task_completions (task_id, completed_on, completed_by, completed_at)
     VALUES ($1::int, $2::date, $3::int, $4::timestamp)`,
    [taskId, day, userId, `${day} 12:00:00`]
  );

/** Определения достижений лежат в сиде, но тесты идут без него: заводим сами. */
const ensureDefinitions = async (): Promise<void> => {
  await pool.query(
    `INSERT INTO achievements (code, name, description, icon, criteria_type, criteria_value)
     VALUES ('first_step', 'Первый шаг', 'Выполните первую задачу по уборке', 'pi-check-circle', 'total_completed', 1),
            ('getting_started', 'Взялся за дело', 'Выполните 5 задач', 'pi-play', 'total_completed', 5)
     ON CONFLICT (code) DO NOTHING`
  );
};

describe.skipIf(!dbReady)('достижения по журналу отметок', () => {
  it('считает дела строками журнала и выдаёт достижения по прежним порогам', async () => {
    await ensureDefinitions();

    const userId = await createUser('achievements-journal');
    const taskId = await createScheduleAndTask(userId, 'Дело для достижений');

    for (let offset = 0; offset < 5; offset += 1) {
      await insertCompletion(taskId, userId, shiftDays(appToday(), -offset));
    }

    const metrics = await collectMetrics(String(userId));

    expect(metrics.total_completed).toBe(5);

    const awarded = await checkAndAwardAchievements(String(userId));

    expect(awarded).toContain('first_step');
    expect(awarded).toContain('getting_started');

    // Снятие сегодняшней отметки убирает ровно один день: закрытые ранее дни
    // остаются в истории и в метрике.
    await pool.query(
      'DELETE FROM task_completions WHERE task_id = $1 AND completed_on = $2::date',
      [taskId, appToday()]
    );

    const afterUnmark = await collectMetrics(String(userId));

    expect(afterUnmark.total_completed).toBe(4);
  });

  it('не считает задачу с прежним флагом, у которой нет отметки в журнале', async () => {
    const userId = await createUser('achievements-legacy');
    const taskId = await createScheduleAndTask(userId, 'Дело с прежним флагом');

    await pool.query(
      'UPDATE tasks SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP, completed_by = $2 WHERE id = $1',
      [taskId, userId]
    );

    const metrics = await collectMetrics(String(userId));

    expect(metrics.total_completed).toBe(0);

    const awarded = await checkAndAwardAchievements(String(userId));

    expect(awarded).not.toContain('first_step');
  });
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await pool
      .query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds])
      .catch(() => undefined);
  }
});
