import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';

const router = express.Router();

/**
 * Аналитика: что и сколько сделано за последние 30 дней.
 *
 * Сводим три источника — свои задачи, задачи челленджей и отметки привычек:
 * по отдельности они не дают картины, а вместе показывают реальную активность.
 */
router.get('/summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const activity = await pool.query(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day')::date AS day
       ),
       own AS (
         SELECT DATE(t.completed_at) AS day,
                COUNT(*)::int AS done,
                COALESCE(SUM(t.estimated_minutes), 0)::int AS minutes
           FROM tasks t
           JOIN schedules s ON s.id = t.schedule_id
          WHERE s.user_id = $1 AND t.is_completed
            AND t.completed_at >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY 1
       ),
       challenge AS (
         SELECT DATE(p.done_at) AS day, COUNT(*)::int AS done
           FROM user_task_progress p
           JOIN user_challenges uc ON uc.id = p.user_challenge_id
          WHERE uc.user_id = $1 AND p.is_done
            AND p.done_at >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY 1
       ),
       habits AS (
         SELECT c.completed_on AS day, COUNT(*)::int AS done
           FROM habit_completions c
           JOIN user_habits h ON h.id = c.user_habit_id
          WHERE h.user_id = $1
            AND c.completed_on >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY 1
       )
       SELECT d.day::text AS date,
              COALESCE(o.done, 0) AS tasks,
              COALESCE(ch.done, 0) AS challenge_tasks,
              COALESCE(hb.done, 0) AS habit_checkins,
              COALESCE(o.minutes, 0) AS minutes
         FROM days d
         LEFT JOIN own o ON o.day = d.day
         LEFT JOIN challenge ch ON ch.day = d.day
         LEFT JOIN habits hb ON hb.day = d.day
        ORDER BY d.day`,
      [req.userId]
    );

    const totals = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM tasks t
            JOIN schedules s ON s.id = t.schedule_id
           WHERE s.user_id = $1 AND t.is_completed) AS own_tasks,
         (SELECT COUNT(*)::int FROM user_task_progress p
            JOIN user_challenges uc ON uc.id = p.user_challenge_id
           WHERE uc.user_id = $1 AND p.is_done) AS challenge_tasks,
         (SELECT COUNT(*)::int FROM habit_completions c
            JOIN user_habits h ON h.id = c.user_habit_id
           WHERE h.user_id = $1) AS habit_checkins,
         (SELECT COUNT(*)::int FROM user_habits
           WHERE user_id = $1 AND archived_at IS NULL) AS active_habits,
         (SELECT COALESCE(SUM(t.estimated_minutes), 0)::int FROM tasks t
            JOIN schedules s ON s.id = t.schedule_id
           WHERE s.user_id = $1 AND t.is_completed) AS own_minutes,
         (SELECT COALESCE(SUM(ct.estimated_minutes), 0)::int FROM user_task_progress p
            JOIN challenge_tasks ct ON ct.id = p.challenge_task_id
            JOIN user_challenges uc ON uc.id = p.user_challenge_id
           WHERE uc.user_id = $1 AND p.is_done) AS challenge_minutes`,
      [req.userId]
    );

    // Зоны: где реально сделано больше всего (свои задачи + челленджи).
    const rooms = await pool.query(
      `SELECT room, COUNT(*)::int AS done
         FROM (
           SELECT t.room
             FROM tasks t
             JOIN schedules s ON s.id = t.schedule_id
            WHERE s.user_id = $1 AND t.is_completed AND t.room IS NOT NULL
           UNION ALL
           SELECT ct.room
             FROM user_task_progress p
             JOIN challenge_tasks ct ON ct.id = p.challenge_task_id
             JOIN user_challenges uc ON uc.id = p.user_challenge_id
            WHERE uc.user_id = $1 AND p.is_done AND ct.room IS NOT NULL
         ) AS zones
        GROUP BY room
        ORDER BY done DESC, room
        LIMIT 6`,
      [req.userId]
    );

    // Топ привычек по количеству отметок — видно, что действительно прижилось.
    // Иконка лежит в шаблоне: у своих привычек её нет, поэтому COALESCE.
    const habits = await pool.query(
      `SELECT h.title, COALESCE(t.icon, 'pi-check-circle') AS icon, COUNT(c.id)::int AS done
         FROM user_habits h
         LEFT JOIN habit_templates t ON t.id = h.template_id
         LEFT JOIN habit_completions c ON c.user_habit_id = h.id
        WHERE h.user_id = $1 AND h.archived_at IS NULL
        GROUP BY h.id, h.title, t.icon
        ORDER BY done DESC, h.title
        LIMIT 5`,
      [req.userId]
    );

    const row = totals.rows[0];

    res.json({
      activity: activity.rows,
      totals: {
        ownTasks: Number(row.own_tasks),
        challengeTasks: Number(row.challenge_tasks),
        habitCheckins: Number(row.habit_checkins),
        activeHabits: Number(row.active_habits),
        minutes: Number(row.own_minutes) + Number(row.challenge_minutes),
      },
      rooms: rooms.rows,
      habits: habits.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch analytics summary' });
  }
});

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
