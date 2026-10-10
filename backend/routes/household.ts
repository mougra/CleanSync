import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { getMembership, generateInviteCode } from '../services/household';
import { sendPushToUser } from '../services/push';

/**
 * Семейный режим: дом, участники, общий план и зоны.
 *
 * Роли простые: владелец («главный») раскидывает задачи и управляет составом,
 * участник видит всё, берёт задачи себе и отмечает выполненное. Такой набор
 * покрывает бытовой сценарий и не превращается в систему прав.
 */
const router = express.Router();

/** Напоминание участнику не чаще раза в 15 минут — иначе это спам. */
const NUDGE_COOLDOWN_MS = 15 * 60 * 1000;
const nudgeSentAt = new Map<string, number>();

interface HouseholdRow {
  id: number;
  name: string;
  owner_id: number;
  invite_code: string;
}

const loadHousehold = async (householdId: number) => {
  const household = await pool.query<HouseholdRow>(
    'SELECT id, name, owner_id, invite_code FROM households WHERE id = $1',
    [householdId]
  );

  if (household.rows.length === 0) {
    return null;
  }

  const row = household.rows[0];

  const members = await pool.query(
    `SELECT u.id, u.email, u.username, m.role, m.joined_at::text AS joined_at,
            (SELECT COUNT(*)::int FROM tasks t
               JOIN schedules s ON s.id = t.schedule_id
              WHERE s.household_id = $1 AND t.completed_by = u.id
                AND t.completed_at >= CURRENT_DATE - INTERVAL '7 days') AS week_done,
            (SELECT COUNT(*)::int FROM tasks t
               JOIN schedules s ON s.id = t.schedule_id
              WHERE s.household_id = $1 AND t.completed_by = u.id
                AND t.completed_at::date = CURRENT_DATE) AS today_done,
            (SELECT COUNT(*)::int FROM tasks t
               JOIN schedules s ON s.id = t.schedule_id
              WHERE s.household_id = $1 AND t.assignee_id = u.id AND t.is_completed = FALSE) AS open_assigned
       FROM household_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.household_id = $1
      ORDER BY (m.role = 'owner') DESC, u.id`,
    [householdId]
  );

  const plan = await pool.query(
    'SELECT id, title, description FROM schedules WHERE household_id = $1 ORDER BY id',
    [householdId]
  );

  const tasks = await pool.query(
    `SELECT t.id, t.schedule_id, t.title, t.room, t.estimated_minutes, t.is_completed,
            t.assignee_id, t.completed_by, t.completed_at::text AS completed_at
       FROM tasks t
       JOIN schedules s ON s.id = t.schedule_id
      WHERE s.household_id = $1
      ORDER BY t.room NULLS LAST, t.id`,
    [householdId]
  );

  // Зоны: сколько дел в каждой и сколько уже закрыто
  const zones = await pool.query(
    `SELECT COALESCE(NULLIF(t.room, ''), 'Без зоны') AS room,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE t.is_completed)::int AS done
       FROM tasks t
       JOIN schedules s ON s.id = t.schedule_id
      WHERE s.household_id = $1
      GROUP BY 1
      ORDER BY total DESC, room`,
    [householdId]
  );

  return {
    household: { id: row.id, name: row.name, ownerId: row.owner_id, inviteCode: row.invite_code },
    members: members.rows,
    plan: plan.rows.map((schedule) => ({
      ...schedule,
      tasks: tasks.rows.filter((task) => task.schedule_id === schedule.id),
    })),
    zones: zones.rows,
  };
};

/** Мой дом: участники со статистикой, общий план и зоны. */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const membership = await getMembership(String(req.userId));

    if (!membership) {
      res.json({ household: null });
      return;
    }

    const data = await loadHousehold(membership.householdId);
    res.json({ ...data, role: membership.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch household' });
  }
});

/** Создать дом: создатель становится владельцем. */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name ?? '').trim();

    if (!name) {
      res.status(400).json({ error: 'Household name is required' });
      return;
    }

    if (await getMembership(String(req.userId))) {
      res.status(400).json({ error: 'You are already in a household' });
      return;
    }

    let householdId: number | null = null;

    // Код приглашения уникален: при совпадении пробуем ещё раз
    for (let attempt = 0; attempt < 5 && householdId === null; attempt += 1) {
      const created = await pool.query<{ id: number }>(
        `INSERT INTO households (name, owner_id, invite_code)
         VALUES ($1, $2, $3)
         ON CONFLICT (invite_code) DO NOTHING
         RETURNING id`,
        [name.slice(0, 120), req.userId, generateInviteCode()]
      );

      householdId = created.rows[0]?.id ?? null;
    }

    if (householdId === null) {
      res.status(500).json({ error: 'Failed to create household' });
      return;
    }

    await pool.query(
      `INSERT INTO household_members (household_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [householdId, req.userId]
    );

    const data = await loadHousehold(householdId);
    res.status(201).json({ ...data, role: 'owner' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create household' });
  }
});

/** Присоединиться по коду приглашения. */
router.post('/join', authMiddleware, async (req: Request, res: Response) => {
  try {
    const code = String(req.body?.code ?? '').trim().toUpperCase();

    if (!code) {
      res.status(400).json({ error: 'Invite code is required' });
      return;
    }

    if (await getMembership(String(req.userId))) {
      res.status(400).json({ error: 'You are already in a household' });
      return;
    }

    const household = await pool.query<{ id: number }>(
      'SELECT id FROM households WHERE invite_code = $1',
      [code]
    );

    if (household.rows.length === 0) {
      res.status(404).json({ error: 'Invite code not found' });
      return;
    }

    await pool.query(
      `INSERT INTO household_members (household_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (household_id, user_id) DO NOTHING`,
      [household.rows[0].id, req.userId]
    );

    const data = await loadHousehold(household.rows[0].id);
    res.status(201).json({ ...data, role: 'member' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join household' });
  }
});

/** Переименовать дом: только владелец. */
router.patch('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const membership = await getMembership(String(req.userId));
    const name = String(req.body?.name ?? '').trim();

    if (!membership) {
      res.status(404).json({ error: 'Household not found' });
      return;
    }

    if (membership.role !== 'owner') {
      res.status(403).json({ error: 'Only the owner can rename the household' });
      return;
    }

    if (!name) {
      res.status(400).json({ error: 'Household name is required' });
      return;
    }

    await pool.query('UPDATE households SET name = $2 WHERE id = $1', [
      membership.householdId,
      name.slice(0, 120),
    ]);

    res.json(await loadHousehold(membership.householdId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to rename household' });
  }
});

/** Выйти из дома. Владелец выходит только когда остался один — дом удаляется. */
router.post('/leave', authMiddleware, async (req: Request, res: Response) => {
  try {
    const membership = await getMembership(String(req.userId));

    if (!membership) {
      res.status(404).json({ error: 'Household not found' });
      return;
    }

    const others = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM household_members WHERE household_id = $1 AND user_id <> $2',
      [membership.householdId, req.userId]
    );

    if (membership.role === 'owner' && Number(others.rows[0]?.total ?? 0) > 0) {
      res.status(400).json({
        error: 'Owner has to remove other members first, or delete the household',
      });
      return;
    }

    // Задачи, назначенные уходящему, снимаем с него: иначе они зависнут
    await pool.query(
      `UPDATE tasks SET assignee_id = NULL
        WHERE assignee_id = $1
          AND schedule_id IN (SELECT id FROM schedules WHERE household_id = $2)`,
      [req.userId, membership.householdId]
    );

    if (membership.role === 'owner') {
      // Последний участник: дом вместе с планом удаляется каскадом
      await pool.query('DELETE FROM households WHERE id = $1', [membership.householdId]);
    } else {
      await pool.query('DELETE FROM household_members WHERE household_id = $1 AND user_id = $2', [
        membership.householdId,
        req.userId,
      ]);
    }

    res.json({ left: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to leave household' });
  }
});

/** Убрать участника: только владелец. */
router.delete('/members/:userId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const membership = await getMembership(String(req.userId));

    if (!membership || membership.role !== 'owner') {
      res.status(403).json({ error: 'Only the owner can remove members' });
      return;
    }

    const target = String(req.params.userId);

    if (target === String(req.userId)) {
      res.status(400).json({ error: 'Owner cannot remove themselves, use leave' });
      return;
    }

    await pool.query(
      `UPDATE tasks SET assignee_id = NULL
        WHERE assignee_id = $1
          AND schedule_id IN (SELECT id FROM schedules WHERE household_id = $2)`,
      [target, membership.householdId]
    );

    const deleted = await pool.query(
      'DELETE FROM household_members WHERE household_id = $1 AND user_id = $2 RETURNING user_id',
      [membership.householdId, target]
    );

    if (deleted.rows.length === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    res.json(await loadHousehold(membership.householdId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

/** Создать общий список (расписание дома). */
router.post('/plan', authMiddleware, async (req: Request, res: Response) => {
  try {
    const membership = await getMembership(String(req.userId));
    const title = String(req.body?.title ?? '').trim();

    if (!membership) {
      res.status(404).json({ error: 'Household not found' });
      return;
    }

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    await pool.query(
      `INSERT INTO schedules (user_id, title, description, household_id)
       VALUES (NULL, $1, $2, $3)`,
      [title.slice(0, 255), String(req.body?.description ?? '').slice(0, 500) || null, membership.householdId]
    );

    res.status(201).json(await loadHousehold(membership.householdId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create household list' });
  }
});

/** Добавить задачу в общий план: зона, время и ответственный. */
router.post('/plan/:scheduleId/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const membership = await getMembership(String(req.userId));
    const title = String(req.body?.title ?? '').trim();

    if (!membership) {
      res.status(404).json({ error: 'Household not found' });
      return;
    }

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const schedule = await pool.query(
      'SELECT id FROM schedules WHERE id = $1 AND household_id = $2',
      [req.params.scheduleId, membership.householdId]
    );

    if (schedule.rows.length === 0) {
      res.status(404).json({ error: 'List not found in your household' });
      return;
    }

    const assigneeId = req.body?.assigneeId ? String(req.body.assigneeId) : null;

    if (assigneeId) {
      const member = await pool.query(
        'SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2',
        [membership.householdId, assigneeId]
      );

      if (member.rows.length === 0) {
        res.status(400).json({ error: 'Assignee is not a household member' });
        return;
      }
    }

    await pool.query(
      `INSERT INTO tasks (schedule_id, title, room, estimated_minutes, assignee_id, frequency)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.params.scheduleId,
        title.slice(0, 255),
        String(req.body?.room ?? '').slice(0, 120) || null,
        Number(req.body?.minutes ?? 0) || 0,
        assigneeId,
        // По умолчанию задача дома попадает в план на каждый день:
        // «общий план» — это текущие дела, а не расписание по дням недели.
        typeof req.body?.frequency === 'string' ? req.body.frequency : 'daily',
      ]
    );

    res.status(201).json(await loadHousehold(membership.householdId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add task' });
  }
});

/**
 * Изменить задачу общего плана: текст, зона, время, ответственный.
 * Владелец назначает кого угодно, участник — только себя (взять задачу).
 */
router.patch('/tasks/:taskId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const membership = await getMembership(String(req.userId));

    if (!membership) {
      res.status(404).json({ error: 'Household not found' });
      return;
    }

    const task = await pool.query(
      `SELECT t.id FROM tasks t
         JOIN schedules s ON s.id = t.schedule_id
        WHERE t.id = $1 AND s.household_id = $2`,
      [req.params.taskId, membership.householdId]
    );

    if (task.rows.length === 0) {
      res.status(404).json({ error: 'Task not found in your household' });
      return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    const push = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    if (typeof req.body?.title === 'string' && req.body.title.trim()) {
      push('title', req.body.title.trim().slice(0, 255));
    }

    if (typeof req.body?.room === 'string' || req.body?.room === null) {
      push('room', req.body.room ? String(req.body.room).slice(0, 120) : null);
    }

    if (req.body?.minutes !== undefined) {
      push('estimated_minutes', Number(req.body.minutes) || 0);
    }

    if (req.body?.assigneeId !== undefined) {
      const assigneeId = req.body.assigneeId ? String(req.body.assigneeId) : null;

      if (assigneeId && membership.role !== 'owner' && assigneeId !== String(req.userId)) {
        res.status(403).json({ error: 'Only the owner can assign tasks to other members' });
        return;
      }

      if (assigneeId) {
        const member = await pool.query(
          'SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2',
          [membership.householdId, assigneeId]
        );

        if (member.rows.length === 0) {
          res.status(400).json({ error: 'Assignee is not a household member' });
          return;
        }
      }

      push('assignee_id', assigneeId);
    }

    if (fields.length === 0) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }

    values.push(req.params.taskId);
    await pool.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${values.length}`, values);

    res.json(await loadHousehold(membership.householdId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/** Удалить задачу: владелец — любую, участник — свою или ничейную. */
router.delete('/tasks/:taskId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const membership = await getMembership(String(req.userId));

    if (!membership) {
      res.status(404).json({ error: 'Household not found' });
      return;
    }

    const task = await pool.query<{ assignee_id: number | null }>(
      `SELECT t.assignee_id FROM tasks t
         JOIN schedules s ON s.id = t.schedule_id
        WHERE t.id = $1 AND s.household_id = $2`,
      [req.params.taskId, membership.householdId]
    );

    if (task.rows.length === 0) {
      res.status(404).json({ error: 'Task not found in your household' });
      return;
    }

    const assigneeId = task.rows[0].assignee_id;

    if (
      membership.role !== 'owner' &&
      assigneeId !== null &&
      String(assigneeId) !== String(req.userId)
    ) {
      res.status(403).json({ error: 'This task is assigned to another member' });
      return;
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.taskId]);
    res.json(await loadHousehold(membership.householdId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/** Подтолкнуть участника: push-уведомление «пора убраться». */
router.post('/nudge/:userId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const membership = await getMembership(String(req.userId));
    const target = String(req.params.userId);

    if (!membership) {
      res.status(404).json({ error: 'Household not found' });
      return;
    }

    if (target === String(req.userId)) {
      res.status(400).json({ error: 'You cannot nudge yourself' });
      return;
    }

    const member = await pool.query(
      'SELECT 1 FROM household_members WHERE household_id = $1 AND user_id = $2',
      [membership.householdId, target]
    );

    if (member.rows.length === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    const cooldownKey = `${membership.householdId}:${target}`;
    const lastSent = nudgeSentAt.get(cooldownKey) ?? 0;

    if (Date.now() - lastSent < NUDGE_COOLDOWN_MS) {
      res.status(429).json({ error: 'Already reminded recently' });
      return;
    }

    const me = await pool.query<{ username: string | null; email: string }>(
      'SELECT username, email FROM users WHERE id = $1',
      [req.userId]
    );

    const who = me.rows[0]?.username || me.rows[0]?.email || 'Кто-то из дома';

    const delivered = await sendPushToUser(target, {
      title: `${who} напоминает про уборку`,
      body: `Общий план дома ждёт: загляните в «Дом» и отметьте своё.`,
      url: '/household',
      tag: `nudge-${membership.householdId}`,
    });

    if (delivered === 0) {
      res.status(409).json({ error: 'The member has no notifications enabled' });
      return;
    }

    nudgeSentAt.set(cooldownKey, Date.now());
    res.json({ delivered });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send nudge' });
  }
});

export default router;
