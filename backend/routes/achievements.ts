import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { collectMetrics } from '../services/achievementManager';

const router = express.Router();

// Get all achievement definitions
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM achievements ORDER BY criteria_value ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

/**
 * Все достижения с прогрессом пользователя: сколько уже сделано
 * по каждому критерию и получено ли достижение.
 */
router.get('/progress', authMiddleware, async (req: Request, res: Response) => {
  try {
    const metrics = await collectMetrics(String(req.userId));

    const result = await pool.query<{
      id: number;
      code: string;
      name: string;
      description: string;
      icon: string;
      criteria_type: keyof typeof metrics;
      criteria_value: number;
      earned_at: string | null;
    }>(
      `SELECT a.id, a.code, a.name, a.description, a.icon,
              a.criteria_type, a.criteria_value, ua.earned_at
         FROM achievements a
         LEFT JOIN user_achievements ua
                ON ua.achievement_id = a.id AND ua.user_id = $1
        ORDER BY a.criteria_type, a.criteria_value`,
      [req.userId]
    );

    res.json({
      earned: result.rows.filter((row) => row.earned_at).length,
      total: result.rows.length,
      achievements: result.rows.map((row) => ({
        ...row,
        current: Math.min(metrics[row.criteria_type] ?? 0, row.criteria_value),
        earned: Boolean(row.earned_at),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch achievement progress' });
  }
});

// Get achievements earned by the current user
router.get('/user', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT a.*, ua.earned_at
       FROM user_achievements ua
       JOIN achievements a ON ua.achievement_id = a.id
       WHERE ua.user_id = $1
       ORDER BY ua.earned_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user achievements' });
  }
});

export default router;
