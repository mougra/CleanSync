import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { checkAndAwardAchievements } from '../services/achievementManager';
import { canAccessSchedule } from '../services/household';

const router = express.Router();

// Get checklists for a task
router.get('/:id/checklists', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify task ownership
    const taskResult = await pool.query('SELECT schedule_id FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const scheduleResult = await pool.query('SELECT user_id FROM schedules WHERE id = $1', [taskResult.rows[0].schedule_id]);
    if (scheduleResult.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const result = await pool.query('SELECT * FROM task_checklists WHERE task_id = $1', [id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch checklists' });
  }
});

// Get today's tasks
router.get('/today', authMiddleware, async (req: Request, res: Response) => {

  try {
    const now = new Date();
    const currentDayOfWeek = now.getUTCDay(); // 0-6
    const currentDayOfMonth = now.getUTCDate(); // 1-31
    const todayStr = now.toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT t.*, s.title as schedule_title
       FROM tasks t
       JOIN schedules s ON t.schedule_id = s.id
       WHERE (
               s.user_id = $1
               -- Общий план дома: задачи мои или ничейные, чужие не показываем
               OR (s.household_id IS NOT NULL
                   AND s.household_id IN (SELECT household_id FROM household_members WHERE user_id = $1)
                   AND (t.assignee_id IS NULL OR t.assignee_id = $1))
             )
         AND (
           -- Периодичность «раз в N дней/недель/месяцев» (interval_count).
           -- При interval_count = 1 всё как раньше: задача дня/недели/месяца.
           -- При большем интервале цикл считается от due_date — даты первой
           -- постановки, поэтому «раз в 3 месяца» не всплывает каждый месяц.
           (t.frequency = 'daily' AND t.interval_count <= 1) OR
           (t.frequency = 'daily' AND t.due_date IS NOT NULL
             AND MOD(($4::date - t.due_date), t.interval_count) = 0) OR
           (t.frequency = 'weekly' AND t.day_of_week = $2 AND t.interval_count <= 1) OR
           (t.frequency = 'weekly' AND t.day_of_week = $2 AND t.due_date IS NOT NULL
             AND MOD(FLOOR(($4::date - t.due_date)::numeric / 7)::int, t.interval_count) = 0) OR
           (t.frequency = 'monthly' AND t.day_of_month = $3 AND t.interval_count <= 1) OR
           (t.frequency = 'monthly' AND t.day_of_month = $3 AND t.due_date IS NOT NULL
             AND MOD(
                   MOD(
                     (EXTRACT(YEAR FROM $4::date) * 12 + EXTRACT(MONTH FROM $4::date))
                     - (EXTRACT(YEAR FROM t.due_date) * 12 + EXTRACT(MONTH FROM t.due_date)),
                     t.interval_count
                   ) + t.interval_count,
                   t.interval_count
                 ) = 0) OR
           (t.due_date = $4)
         )
       ORDER BY t.time ASC`,
      [req.userId, currentDayOfWeek, currentDayOfMonth, todayStr]
    );

    const tasks = result.rows;
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.is_completed).length;
    const totalMinutes = tasks.reduce((acc, t) => acc + (t.estimated_minutes || 0), 0);
    const remainingMinutes = tasks.filter(t => !t.is_completed).reduce((acc, t) => acc + (t.estimated_minutes || 0), 0);

    // Group tasks by room
    const groupedTasks: { [key: string]: any[] } = {};
    for (const task of tasks) {
      const room = task.room || 'General';
      if (!groupedTasks[room]) groupedTasks[room] = [];
      groupedTasks[room].push(task);
    }

    res.json({
      summary: {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        progress: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
        total_estimated_time: totalMinutes,
        remaining_time: remainingMinutes
      },
      tasks: groupedTasks
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch today\'s tasks' });
  }
});

// Create task
router.post('/', authMiddleware, async (req: Request, res: Response) => {

  try {
    const { schedule_id, title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room, interval_count } = req.body;

    if (!schedule_id || !title) {
      return res.status(400).json({ error: 'schedule_id and title required' });
    }

    // Check ownership
    const scheduleResult = await pool.query(
      'SELECT user_id FROM schedules WHERE id = $1',
      [schedule_id]
    );

    if (scheduleResult.rows.length === 0 || scheduleResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // «Раз в N дней/недель/месяцев»: интервал меньше единицы не имеет смысла,
    // поэтому всё, что не положительное целое, сводится к «раз в 1».
    const interval = Number.isInteger(interval_count) && interval_count > 0 ? interval_count : 1;

    // `??`, а не `||`: ноль здесь законное значение. `day_of_week = 0` — это
    // воскресенье, и с `||` повтор на воскресенье сохранялся как «без дня».
    const result = await pool.query(
      'INSERT INTO tasks (schedule_id, title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room, interval_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, title, frequency, interval_count, day_of_week, day_of_month, due_date, time, estimated_minutes, room, is_completed, created_at',
      [schedule_id, title, frequency ?? null, day_of_week ?? null, day_of_month ?? null, due_date ?? null, time ?? null, estimated_minutes ?? 0, room ?? null, interval]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room, is_completed, interval_count } = req.body;

    // Check ownership via schedule
    const taskResult = await pool.query(
      'SELECT schedule_id FROM tasks WHERE id = $1',
      [id]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Доступ: своё расписание или общий план дома, в котором я состою
    const access = await canAccessSchedule(String(req.userId), taskResult.rows[0].schedule_id);

    if (!access.allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await pool.query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        frequency = COALESCE($2, frequency),
        day_of_week = COALESCE($3, day_of_week),
        day_of_month = COALESCE($4, day_of_month),
        due_date = COALESCE($5, due_date),
        time = COALESCE($6, time),
        estimated_minutes = COALESCE($7, estimated_minutes),
        room = COALESCE($8, room),
        -- Интервал периодичности: принимаем только положительное целое
        interval_count = COALESCE($12::int, interval_count),
        is_completed = COALESCE($9, is_completed),
        completed_at = CASE
          WHEN COALESCE($9, is_completed) = TRUE THEN CURRENT_TIMESTAMP
          ELSE NULL
        END,
        -- Кто именно закрыл: нужно для личной серии и статистики дома.
        -- Приведение к int обязательно: из JWT идентификатор приходит строкой.
        completed_by = CASE
          WHEN COALESCE($9, is_completed) = TRUE THEN $11::int
          ELSE NULL
        END
      WHERE id = $10
      RETURNING id, title, frequency, interval_count, day_of_week, day_of_month, due_date, time, estimated_minutes, room, is_completed, completed_at, created_at, assignee_id, completed_by`,
      [title ?? null, frequency ?? null, day_of_week ?? null, day_of_month ?? null, due_date ?? null, time ?? null, estimated_minutes ?? null, room ?? null, is_completed !== undefined ? is_completed : null, id, req.userId, Number.isInteger(interval_count) && interval_count > 0 ? interval_count : null]
    );

    // Award achievements if task was completed
    let awarded: string[] = [];
    if (result.rows[0] && result.rows[0].is_completed) {
      awarded = await checkAndAwardAchievements(req.userId!);
    }

    res.json({ ...result.rows[0], awarded });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * Удалить задачу.
 *
 * Свою — можно всегда. В общем плане дома участник удаляет только свою или
 * ничейную задачу, владелец — любую. Отдельного DELETE раньше не было вовсе,
 * поэтому кнопка удаления пункта в чек-листе упиралась в 404.
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const taskResult = await pool.query<{ schedule_id: number; assignee_id: number | null }>(
      'SELECT schedule_id, assignee_id FROM tasks WHERE id = $1',
      [id]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const access = await canAccessSchedule(String(req.userId), taskResult.rows[0].schedule_id);

    if (!access.allowed) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const assigneeId = taskResult.rows[0].assignee_id;

    if (access.householdId !== null && assigneeId !== null && String(assigneeId) !== String(req.userId)) {
      // Роль смотрим в том же доме, к которому относится задача: владельцем
      // человек может быть в одном доме и участником в другом.
      if (access.role !== 'owner') {
        return res.status(403).json({ error: 'This task is assigned to another member' });
      }
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ deleted: true, id: Number(id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Checklist endpoints
router.post('/:id/checklists', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { item } = req.body;

    if (!item) return res.status(400).json({ error: 'Item text required' });

    // Verify task ownership
    const taskResult = await pool.query('SELECT schedule_id FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const scheduleResult = await pool.query('SELECT user_id FROM schedules WHERE id = $1', [taskResult.rows[0].schedule_id]);
    if (scheduleResult.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const result = await pool.query(
      'INSERT INTO task_checklists (task_id, item) VALUES ($1, $2) RETURNING *',
      [id, item]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checklist item' });
  }
});

router.patch('/checklists/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_completed } = req.body;

    if (is_completed === undefined) return res.status(400).json({ error: 'is_completed required' });

    // Verify ownership through task and schedule
    const checklistResult = await pool.query(
      'SELECT t.schedule_id FROM task_checklists cl JOIN tasks t ON cl.task_id = t.id WHERE cl.id = $1',
      [id]
    );
    if (checklistResult.rows.length === 0) return res.status(404).json({ error: 'Checklist item not found' });

    const scheduleResult = await pool.query('SELECT user_id FROM schedules WHERE id = $1', [checklistResult.rows[0].schedule_id]);
    if (scheduleResult.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const result = await pool.query(
      'UPDATE task_checklists SET is_completed = $1 WHERE id = $2 RETURNING *',
      [is_completed, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update checklist item' });
  }
});

router.delete('/checklists/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const checklistResult = await pool.query(
      'SELECT t.schedule_id FROM task_checklists cl JOIN tasks t ON cl.task_id = t.id WHERE cl.id = $1',
      [id]
    );
    if (checklistResult.rows.length === 0) return res.status(404).json({ error: 'Checklist item not found' });

    const scheduleResult = await pool.query('SELECT user_id FROM schedules WHERE id = $1', [checklistResult.rows[0].schedule_id]);
    if (scheduleResult.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    await pool.query('DELETE FROM task_checklists WHERE id = $1', [id]);
    res.json({ message: 'Checklist item deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete checklist item' });
  }
});

export default router;
