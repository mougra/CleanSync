import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../auth.js';

const router = express.Router();

// Get all schedules for user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, description, created_at, updated_at FROM schedules WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Get single schedule with tasks
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const scheduleResult = await pool.query(
      'SELECT id, title, description, created_at, updated_at FROM schedules WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const schedule = scheduleResult.rows[0];

    const tasksResult = await pool.query(
      'SELECT id, title, frequency, day_of_week, time, is_completed, created_at FROM tasks WHERE schedule_id = $1 ORDER BY day_of_week, time',
      [id]
    );

    res.json({
      ...schedule,
      tasks: tasksResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Create schedule
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    const result = await pool.query(
      'INSERT INTO schedules (user_id, title, description) VALUES ($1, $2, $3) RETURNING id, title, description, created_at, updated_at',
      [req.userId, title, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// Update schedule
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    // Check ownership
    const ownerResult = await pool.query(
      'SELECT user_id FROM schedules WHERE id = $1',
      [id]
    );

    if (ownerResult.rows.length === 0 || ownerResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await pool.query(
      'UPDATE schedules SET title = COALESCE($1, title), description = COALESCE($2, description), updated_at = NOW() WHERE id = $3 RETURNING id, title, description, created_at, updated_at',
      [title || null, description || null, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// Delete schedule
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const ownerResult = await pool.query(
      'SELECT user_id FROM schedules WHERE id = $1',
      [id]
    );

    if (ownerResult.rows.length === 0 || ownerResult.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Delete tasks first (foreign key)
    await pool.query('DELETE FROM tasks WHERE schedule_id = $1', [id]);

    // Delete schedule
    await pool.query('DELETE FROM schedules WHERE id = $1', [id]);

    res.json({ message: 'Schedule deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

export default router;
