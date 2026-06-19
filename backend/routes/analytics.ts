import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';

const router = express.Router();

// Get tasks completed per day for the last 30 days
router.get('/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT DATE(completed_at) as date, COUNT(*) as count
       FROM tasks
       JOIN schedules ON tasks.schedule_id = schedules.id
       WHERE schedules.user_id = $1
       AND completed_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY DATE(completed_at)
       ORDER BY date ASC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

export default router;
