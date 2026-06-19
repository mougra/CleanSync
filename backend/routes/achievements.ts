import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';

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
