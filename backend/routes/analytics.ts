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

type Period = 'week' | 'month' | 'all';

const PERIOD_SINCE: Record<Period, string> = {
  week: '7 days',
  month: '30 days',
  // «За всё время» — заведомо раньше любых данных, чтобы не городить ветки в SQL
  all: '2000 days',
};

const isPeriod = (value: unknown): value is Period =>
  value === 'week' || value === 'month' || value === 'all';

/**
 * Обзор для раздела «Статистика»: периоды, распределение по дням недели,
 * последние 7 дней, самая долгая задача и история уборки.
 *
 * Считаем по двум источникам — свои задачи (включая семейные, если их закрыл
 * я) и задачи челленджей: у них есть и название, и оценка времени, поэтому
 * история получается честной. Отметки привычек в историю не попадают: у них
 * нет длительности, а придумывать её нельзя.
 */
router.get('/overview', authMiddleware, async (req: Request, res: Response) => {
  try {
    const period: Period = isPeriod(req.query.period) ? req.query.period : 'all';
    const since = PERIOD_SINCE[period];

    const items = `
      SELECT t.title,
             DATE(t.completed_at) AS day,
             t.completed_at,
             COALESCE(t.estimated_minutes, 0)::int AS minutes,
             t.room,
             'task' AS kind
        FROM tasks t
        JOIN schedules s ON s.id = t.schedule_id
       WHERE (s.user_id = $1 OR t.completed_by = $1)
         AND t.is_completed
         AND t.completed_at >= CURRENT_DATE - ($2 || ' days')::interval
      UNION ALL
      SELECT ct.title,
             DATE(p.done_at) AS day,
             p.done_at AS completed_at,
             COALESCE(ct.estimated_minutes, 0)::int AS minutes,
             ct.room,
             'challenge' AS kind
        FROM user_task_progress p
        JOIN challenge_tasks ct ON ct.id = p.challenge_task_id
        JOIN user_challenges uc ON uc.id = p.user_challenge_id
       WHERE uc.user_id = $1 AND p.is_done
         AND p.done_at >= CURRENT_DATE - ($2 || ' days')::interval
    `;

    const totals = await pool.query(
      `WITH items AS (${items})
       SELECT COUNT(*)::int AS tasks,
              COALESCE(SUM(minutes), 0)::int AS minutes,
              COUNT(DISTINCT day)::int AS days
         FROM items`,
      [req.userId, since]
    );

    // Последние 7 дней показываем всегда, независимо от выбранного периода
    const last7 = await pool.query(
      `WITH items AS (${items})
       SELECT COUNT(*)::int AS tasks, COALESCE(SUM(minutes), 0)::int AS minutes
         FROM items
        WHERE day >= CURRENT_DATE - INTERVAL '6 days'`,
      [req.userId, since]
    );

    const weekday = await pool.query(
      `WITH items AS (${items})
       SELECT EXTRACT(DOW FROM day)::int AS weekday,
              COUNT(*)::int AS tasks,
              COALESCE(SUM(minutes), 0)::int AS minutes
         FROM items
        GROUP BY 1`,
      [req.userId, since]
    );

    const longest = await pool.query(
      `WITH items AS (${items})
       SELECT title, minutes, day::text AS date
         FROM items
        WHERE minutes > 0
        ORDER BY minutes DESC, completed_at DESC
        LIMIT 1`,
      [req.userId, since]
    );

    // История ограничена тремя сотнями записей: этого хватает надолго,
    // а ответ остаётся лёгким.
    const history = await pool.query(
      `WITH items AS (${items})
       SELECT title, day::text AS date, minutes, room, kind
         FROM items
        ORDER BY completed_at DESC
        LIMIT 300`,
      [req.userId, since]
    );

    const byWeekday = Array.from({ length: 7 }, (_, index) => {
      const found = weekday.rows.find(
        (row: { weekday: number }) => Number(row.weekday) === index
      );

      return {
        weekday: index,
        tasks: Number(found?.tasks ?? 0),
        minutes: Number(found?.minutes ?? 0),
      };
    });

    const busiest = byWeekday.reduce<{ weekday: number; tasks: number } | null>(
      (best, day) => (day.tasks > 0 && (!best || day.tasks > best.tasks) ? day : best),
      null
    );

    res.json({
      period,
      totals: {
        tasks: Number(totals.rows[0]?.tasks ?? 0),
        minutes: Number(totals.rows[0]?.minutes ?? 0),
        days: Number(totals.rows[0]?.days ?? 0),
      },
      last7: {
        tasks: Number(last7.rows[0]?.tasks ?? 0),
        minutes: Number(last7.rows[0]?.minutes ?? 0),
      },
      weekday: byWeekday,
      busiestWeekday: busiest?.weekday ?? null,
      longest: longest.rows[0] ?? null,
      history: history.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
});

export default router;
