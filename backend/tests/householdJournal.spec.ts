import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db';
import { generateTokens } from '../auth';
import { appToday } from '../services/appTime';

/**
 * Дом считает сделанное участниками по журналу отметок (миграция 0018).
 *
 * `today_done` и `week_done` раньше читали последнюю отметку задачи
 * (`tasks.completed_at` / `completed_by`): несколько дней одного и того же дела
 * дома выглядели как одно, а снятая галочка стирала участника из статистики.
 * Теперь счёт идёт по строкам `task_completions` — в зачёт попадает тот, кто
 * закрыл дело (`completed_by`), а не владелец расписания и не назначенный:
 * задача дома считается сделанной, кто бы из участников её ни закрыл. «Сегодня» —
 * календарный день приложения (`SQL_APP_TODAY`), а не пояс сервера.
 *
 * Тесты работают с настоящей базой, как CI; без базы блок пропускается.
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
  ownerId: number;
  memberId: number;
  householdId: number;
  scheduleId: number;
  ownerToken: string;
  memberToken: string;
}

const createUser = async (prefix: string): Promise<number> => {
  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password, username)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      'test-password-hash',
      prefix,
    ]
  );

  createdUserIds.push(user.rows[0].id);

  return user.rows[0].id;
};

const createFixture = async (): Promise<Fixture> => {
  const ownerId = await createUser('household-owner');
  const memberId = await createUser('household-member');

  const household = await pool.query<{ id: number }>(
    `INSERT INTO households (name, owner_id, invite_code)
     VALUES ('Дом QA', $1, $2)
     RETURNING id`,
    [ownerId, `QA${Math.random().toString(36).slice(2, 10).toUpperCase()}`]
  );

  const householdId = household.rows[0].id;

  await pool.query(
    `INSERT INTO household_members (household_id, user_id, role)
     VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
    [householdId, ownerId, memberId]
  );

  // Общий план дома: у расписания нет владельца-пользователя.
  const schedule = await pool.query<{ id: number }>(
    `INSERT INTO schedules (user_id, title, household_id)
     VALUES (NULL, 'План дома QA', $1)
     RETURNING id`,
    [householdId]
  );

  return {
    ownerId,
    memberId,
    householdId,
    scheduleId: schedule.rows[0].id,
    ownerToken: generateTokens(String(ownerId)).accessToken,
    memberToken: generateTokens(String(memberId)).accessToken,
  };
};

const createTask = async (scheduleId: number, title: string): Promise<number> => {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO tasks (schedule_id, title, frequency, estimated_minutes, room)
     VALUES ($1, $2, 'daily', 10, 'Кухня')
     RETURNING id`,
    [scheduleId, title]
  );

  return result.rows[0].id;
};

interface MemberRow {
  id: number;
  role: string;
  today_done: number;
  week_done: number;
}

const memberStats = async (
  token: string,
  householdId: number
): Promise<Record<number, MemberRow>> => {
  const response = await request(app)
    .get('/api/household')
    .set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(200);

  const households = response.body.households as Array<{
    household: { id: number };
    members: MemberRow[];
  }>;

  const found = households.find((entry) => entry.household.id === householdId);

  expect(found).toBeDefined();

  return Object.fromEntries(
    (found?.members ?? []).map((member) => [member.id, member])
  );
};

describe.skipIf(!dbReady)('дом считает today_done и week_done по журналу', () => {
  it('засчитывает дело тому, кто его закрыл, и различает сегодня и вчера', async () => {
    const { ownerId, memberId, householdId, scheduleId, memberToken } = await createFixture();
    const todayTaskId = await createTask(scheduleId, 'Помыть посуду');
    const yesterdayTaskId = await createTask(scheduleId, 'Вынести мусор');
    const yesterday = shiftDays(appToday(), -1);

    const before = await memberStats(memberToken, householdId);

    expect(before[ownerId]).toMatchObject({ today_done: 0, week_done: 0 });
    expect(before[memberId]).toMatchObject({ today_done: 0, week_done: 0 });

    // Задача ничья (не назначена) — участник закрывает её сам, и она идёт ему.
    const marked = await request(app)
      .put(`/api/tasks/${todayTaskId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ is_completed: true });

    expect(marked.status).toBe(200);

    // Вчерашняя отметка того же участника: в журнал пишем напрямую, через API
    // задним числом отметку не поставить.
    await pool.query(
      `INSERT INTO task_completions (task_id, completed_on, completed_by, completed_at)
       VALUES ($1::int, $2::date, $3::int, $4::timestamp)`,
      [yesterdayTaskId, yesterday, memberId, `${yesterday} 12:00:00`]
    );

    const after = await memberStats(memberToken, householdId);

    expect(after[memberId]).toMatchObject({ today_done: 1, week_done: 2 });
    expect(after[ownerId]).toMatchObject({ today_done: 0, week_done: 0 });
  });

  it('не считает прежние колонки задачи: только журнал', async () => {
    const { ownerId, householdId, scheduleId, memberToken } = await createFixture();
    const legacyTaskId = await createTask(scheduleId, 'Дело с прежним флагом');

    // Флаг задачи выставлен, автора отметили, но строки журнала нет: дом
    // считает по журналу, поэтому в статистику такое дело не попадает.
    await pool.query(
      `UPDATE tasks
          SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP, completed_by = $2
        WHERE id = $1`,
      [legacyTaskId, ownerId]
    );

    const stats = await memberStats(memberToken, householdId);

    expect(stats[ownerId]).toMatchObject({ today_done: 0, week_done: 0 });
  });
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await pool
      .query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds])
      .catch(() => undefined);
  }
});
