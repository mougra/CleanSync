import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { collectMetrics } from '../services/achievementManager';
import { resolveContentLocale } from '../services/contentLocale';

const router = express.Router();

/**
 * Название и описание достижения отдаём на языке запроса.
 *
 * Русские колонки остаются в таблице как язык по умолчанию, английский лежит
 * в `achievement_translations`. `COALESCE` — обязательная часть: если перевода
 * нет, пользователь увидит русское название, а не пустую строку.
 */
const LOCALIZED_COLUMNS = `
  a.id, a.code,
  COALESCE(t.name, a.name) AS name,
  COALESCE(t.description, a.description) AS description,
  a.icon, a.criteria_type, a.criteria_value, a.created_at`;

// Get all achievement definitions
router.get('/', async (req: Request, res: Response) => {
  try {
    const locale = resolveContentLocale(req);

    const result = await pool.query(
      `SELECT ${LOCALIZED_COLUMNS}
         FROM achievements a
         LEFT JOIN achievement_translations t
                ON t.achievement_id = a.id AND t.locale = $1
        ORDER BY a.criteria_value ASC`,
      [locale]
    );

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
    const locale = resolveContentLocale(req);
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
      `SELECT ${LOCALIZED_COLUMNS}, ua.earned_at
         FROM achievements a
         LEFT JOIN achievement_translations t
                ON t.achievement_id = a.id AND t.locale = $2
         LEFT JOIN user_achievements ua
                ON ua.achievement_id = a.id AND ua.user_id = $1
        ORDER BY a.criteria_type, a.criteria_value`,
      [req.userId, locale]
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
    const locale = resolveContentLocale(req);

    const result = await pool.query(
      `SELECT ${LOCALIZED_COLUMNS}, ua.earned_at
         FROM user_achievements ua
         JOIN achievements a ON ua.achievement_id = a.id
         LEFT JOIN achievement_translations t
                ON t.achievement_id = a.id AND t.locale = $2
        WHERE ua.user_id = $1
        ORDER BY ua.earned_at DESC`,
      [req.userId, locale]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user achievements' });
  }
});

export default router;
