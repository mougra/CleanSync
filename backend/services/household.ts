import crypto from 'crypto';
import pool from '../db';

/**
 * Семейный режим: дома, участники и общий план.
 *
 * У пользователя может быть несколько домов (личный, дача, квартира родителей).
 * Роль хранится в паре (household_id, user_id): владелец одного дома может быть
 * обычным участником другого, поэтому все проверки прав идут по конкретному дому,
 * а не по одному user_id.
 *
 * Общий план — это расписания с `household_id`: у них нет владельца-пользователя,
 * доступ проверяется по членству в доме. Личные списки (`user_id`) работают как
 * раньше и в дом не попадают.
 */

export interface Membership {
  householdId: number;
  role: string;
  name: string;
  inviteCode: string;
  ownerId: number;
}

/** Все дома пользователя. Порядок в списке — «свои» дома вперёд, потом по дате входа. */
export const listMemberships = async (userId: string): Promise<Membership[]> => {
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
      WHERE m.user_id = $1
      ORDER BY (m.role = 'owner') DESC, m.joined_at, h.id`,
    [userId]
  );

  return result.rows.map((row) => ({
    householdId: row.household_id,
    role: row.role,
    name: row.name,
    inviteCode: row.invite_code,
    ownerId: row.owner_id,
  }));
};

/** Роль пользователя в доме: `owner`, `member` или null, если он не в доме. */
export const roleIn = async (userId: string, householdId: number): Promise<string | null> => {
  const result = await pool.query<{ role: string }>(
    'SELECT role FROM household_members WHERE household_id = $1 AND user_id = $2',
    [householdId, userId]
  );

  return result.rows[0]?.role ?? null;
};

/**
 * Доступ к расписанию: своё личное или общий план дома, в котором я состою.
 * Используется в маршрутах задач, чтобы один и тот же PUT отмечал и личные,
 * и семейные задачи. Вместе с доступом возвращаем роль в этом доме: «владелец»
 * не глобальная характеристика, а роль в конкретном доме.
 */
export const canAccessSchedule = async (
  userId: string,
  scheduleId: number
): Promise<{ allowed: boolean; householdId: number | null; ownerId: number | null; role: string | null }> => {
  const result = await pool.query<{ user_id: number | null; household_id: number | null }>(
    'SELECT user_id, household_id FROM schedules WHERE id = $1',
    [scheduleId]
  );

  const row = result.rows[0];

  if (!row) {
    return { allowed: false, householdId: null, ownerId: null, role: null };
  }

  if (row.user_id !== null && String(row.user_id) === String(userId)) {
    return { allowed: true, householdId: row.household_id, ownerId: row.user_id, role: null };
  }

  if (row.household_id !== null) {
    const role = await roleIn(userId, row.household_id);

    if (role !== null) {
      return { allowed: true, householdId: row.household_id, ownerId: row.user_id, role };
    }
  }

  return { allowed: false, householdId: row.household_id, ownerId: row.user_id, role: null };
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
