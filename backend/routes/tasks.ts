import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { checkAndAwardAchievements } from '../services/achievementManager';

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
       WHERE s.user_id = $1
       AND (
         (t.frequency = 'daily') OR
         (t.frequency = 'weekly' AND t.day_of_week = $2) OR
         (t.frequency = 'monthly' AND t.day_of_month = $3) OR
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
    const { schedule_id, title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room } = req.body;

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

    const result = await pool.query(
      'INSERT INTO tasks (schedule_id, title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room, is_completed, created_at',
      [schedule_id, title, frequency || null, day_of_week || null, day_of_month || null, due_date || null, time || null, estimated_minutes || 0, room || null]
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
    const { title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room, is_completed } = req.body;

    // Check ownership via schedule
    const taskResult = await pool.query(
      'SELECT schedule_id FROM tasks WHERE id = $1',
      [id]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const scheduleResult = await pool.query(
      'SELECT user_id FROM schedules WHERE id = $1',
      [taskResult.rows[0].schedule_id]
    );

    if (scheduleResult.rows[0].user_id !== req.userId) {
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
        is_completed = COALESCE($9, is_completed),
        completed_at = CASE
          WHEN COALESCE($9, is_completed) = TRUE THEN CURRENT_TIMESTAMP
          ELSE NULL
        END
      WHERE id = $10
      RETURNING id, title, frequency, day_of_week, day_of_month, due_date, time, estimated_minutes, room, is_completed, completed_at, created_at`,
      [title || null, frequency || null, day_of_week || null, day_of_month || null, due_date || null, time || null, estimated_minutes || null, room || null, is_completed !== undefined ? is_completed : null, id]
    );

    // Award achievements if task was completed
    if (result.rows[0] && result.rows[0].is_completed) {
      await checkAndAwardAchievements(req.userId!);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
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
