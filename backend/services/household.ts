import crypto from 'crypto';
import pool from '../db';

/**
 * Семейный режим: дом, участники и общий план.
 *
 * У пользователя один дом. Общий план — это расписания с `household_id`:
 * у них нет владельца-пользователя, доступ проверяется по членству в доме.
 * Личные списки (`user_id`) работают как раньше и в дом не попадают.
 */

export interface Membership {
  householdId: number;
  role: string;
  name: string;
  inviteCode: string;
  ownerId: number;
}

export const getMembership = async (userId: string): Promise<Membership | null> => {
  const result = await pool.query<{
    household_id: number;
    role: string;
    name: string;
    invite_code: string;
    owner_id: number;
  }>(
    `SELECT m.household_id, m.role, h.name, h.invite_code, h.owner_id
       FROM household_members m
       JOIN households h ON h.id = m.household_id
      WHERE m.user_id = $1`,
    [userId]
  );

  const row = result.rows[0];

  return row
    ? {
        householdId: row.household_id,
        role: row.role,
        name: row.name,
        inviteCode: row.invite_code,
        ownerId: row.owner_id,
      }
    : null;
};

export const isMember = async (userId: string, householdId: number): Promise<boolean> => {
  const result = await pool.query(
    'SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2',
    [householdId, userId]
  );

  return result.rowCount !== null && result.rowCount > 0;
};

export const householdMemberIds = async (householdId: number): Promise<string[]> => {
  const result = await pool.query<{ user_id: number }>(
    'SELECT user_id FROM household_members WHERE household_id = $1',
    [householdId]
  );

  return result.rows.map((row) => String(row.user_id));
};

/**
 * Доступ к расписанию: своё личное или общий план дома, в котором я состою.
 * Используется в маршрутах задач, чтобы один и тот же PUT отмечал и личные,
 * и семейные задачи.
 */
export const canAccessSchedule = async (
  userId: string,
  scheduleId: number
): Promise<{ allowed: boolean; householdId: number | null; ownerId: number | null }> => {
  const result = await pool.query<{ user_id: number | null; household_id: number | null }>(
    'SELECT user_id, household_id FROM schedules WHERE id = $1',
    [scheduleId]
  );

  const row = result.rows[0];

  if (!row) {
    return { allowed: false, householdId: null, ownerId: null };
  }

  if (row.user_id !== null && String(row.user_id) === String(userId)) {
    return { allowed: true, householdId: row.household_id, ownerId: row.user_id };
  }

  if (row.household_id !== null && (await isMember(userId, row.household_id))) {
    return { allowed: true, householdId: row.household_id, ownerId: row.user_id };
  }

  return { allowed: false, householdId: row.household_id, ownerId: row.user_id };
};

/** Код приглашения: короткий, без похожих символов (0/O, 1/I). */
export const generateInviteCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let index = 0; index < 8; index += 1) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }

  return code;
};
