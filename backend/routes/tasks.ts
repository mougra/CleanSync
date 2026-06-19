import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { checkAndAwardAchievements } from '../services/achievementManager';

const router = express.Router();

// Create task
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { schedule_id, title, frequency, day_of_week, time } = req.body;

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
      'INSERT INTO tasks (schedule_id, title, frequency, day_of_week, time) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, frequency, day_of_week, time, is_completed, created_at',
      [schedule_id, title, frequency || null, day_of_week || null, time || null]
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
    const { title, frequency, day_of_week, time, is_completed } = req.body;

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
        time = COALESCE($4, time),
        is_completed = COALESCE($5, is_completed),
        completed_at = CASE
          WHEN COALESCE($5, is_completed) = TRUE THEN CURRENT_TIMESTAMP
          ELSE NULL
        END
      WHERE id = $6
      RETURNING id, title, frequency, day_of_week, time, is_completed, completed_at, created_at`,
      [title || null, frequency || null, day_of_week || null, time || null, is_completed !== undefined ? is_completed : null, id]
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

// Delete task
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

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

    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);

    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
