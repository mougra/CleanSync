import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';

const router = express.Router();

interface ChallengeRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  season: string | null;
  days_count: number;
  tasks_count: number;
}

interface ProgressRow {
  day_id: number;
  day_number: number;
  day_title: string;
  subtitle: string | null;
  task_id: number | null;
  position: number | null;
  title: string | null;
  hint: string | null;
  room: string | null;
  estimated_minutes: number | null;
  is_done: boolean | null;
}

/** Дни с задачами и отметками пользователя — собираем из плоской выборки. */
const loadDays = async (challengeId: number, userChallengeId: number | null) => {
  const result = await pool.query<ProgressRow>(
    `SELECT d.id AS day_id, d.day_number, d.title AS day_title, d.subtitle,
            t.id AS task_id, t.position, t.title, t.hint, t.room, t.estimated_minutes,
            COALESCE(p.is_done, FALSE) AS is_done
       FROM challenge_days d
       LEFT JOIN challenge_tasks t ON t.challenge_day_id = d.id
       LEFT JOIN user_task_progress p
              ON p.challenge_task_id = t.id AND p.user_challenge_id = $2
      WHERE d.challenge_id = $1
      ORDER BY d.day_number, t.position`,
    [challengeId, userChallengeId]
  );

  const days: Array<{
    id: number;
    day_number: number;
    title: string;
    subtitle: string | null;
    tasks: Array<{
      id: number;
      position: number;
      title: string;
      hint: string | null;
      room: string | null;
      estimated_minutes: number;
      is_done: boolean;
    }>;
  }> = [];

  for (const row of result.rows) {
    let day = days.find((item) => item.id === row.day_id);

    if (!day) {
      day = {
        id: row.day_id,
        day_number: row.day_number,
        title: row.day_title,
        subtitle: row.subtitle,
        tasks: [],
      };
      days.push(day);
    }

    if (row.task_id !== null) {
      day.tasks.push({
        id: row.task_id,
        position: row.position ?? 0,
        title: row.title ?? '',
        hint: row.hint,
        room: row.room,
        estimated_minutes: row.estimated_minutes ?? 0,
        is_done: Boolean(row.is_done),
      });
    }
  }

  return days;
};

const summarize = (
  days: Awaited<ReturnType<typeof loadDays>>
): { done: number; total: number; percent: number; minutesLeft: number; currentDay: number | null } => {
  let done = 0;
  let total = 0;
  let minutesLeft = 0;
  let currentDay: number | null = null;

  for (const day of days) {
    for (const task of day.tasks) {
      total += 1;

      if (task.is_done) {
        done += 1;
      } else {
        minutesLeft += task.estimated_minutes;
        currentDay ??= day.day_number;
      }
    }
  }

  return {
    done,
    total,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    minutesLeft,
    currentDay,
  };
};

/** Список опубликованных челленджей. */
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query<ChallengeRow>(
      `SELECT id, slug, title, description, season, days_count, tasks_count
         FROM challenges
        WHERE is_published = TRUE
        ORDER BY position, id`
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

/**
 * Активный челлендж пользователя с прогрессом.
 * Объявлен до `/:slug`, иначе 'active' попадёт в параметр.
 */
router.get('/active', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userChallenge = await pool.query(
      `SELECT uc.id, uc.status, uc.started_at, uc.finished_at,
              c.id AS challenge_id, c.slug, c.title, c.description, c.days_count, c.tasks_count
         FROM user_challenges uc
         JOIN challenges c ON c.id = uc.challenge_id
        WHERE uc.user_id = $1 AND uc.status = 'active'
        ORDER BY uc.started_at DESC
        LIMIT 1`,
      [req.userId]
    );

    if (userChallenge.rows.length === 0) {
      res.json({ active: null });
      return;
    }

    const row = userChallenge.rows[0];
    const days = await loadDays(row.challenge_id, row.id);
    const progress = summarize(days);

    res.json({
      active: {
        userChallengeId: row.id,
        startedAt: row.started_at,
        challenge: {
          id: row.challenge_id,
          slug: row.slug,
          title: row.title,
          description: row.description,
          days_count: row.days_count,
          tasks_count: row.tasks_count,
        },
        progress,
        days,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch active challenge' });
  }
});

/** Детали челленджа: дни и задачи. Прогресс подмешивается, если пользователь вошёл. */
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const challenge = await pool.query<ChallengeRow>(
      `SELECT id, slug, title, description, season, days_count, tasks_count
         FROM challenges
        WHERE slug = $1 AND is_published = TRUE`,
      [req.params.slug]
    );

    if (challenge.rows.length === 0) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }

    const row = challenge.rows[0];
    const days = await loadDays(row.id, null);

    res.json({ challenge: row, progress: summarize(days), days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

/** Старт челленджа. Повторный старт того же челленджа идемпотентен. */
router.post('/:slug/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const challenge = await pool.query<{ id: number }>(
      'SELECT id FROM challenges WHERE slug = $1 AND is_published = TRUE',
      [req.params.slug]
    );

    if (challenge.rows.length === 0) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }

    const challengeId = challenge.rows[0].id;

    const active = await pool.query<{ id: number; challenge_id: number }>(
      `SELECT id, challenge_id FROM user_challenges
        WHERE user_id = $1 AND status = 'active'
        ORDER BY started_at DESC LIMIT 1`,
      [req.userId]
    );

    if (active.rows.length > 0 && active.rows[0].challenge_id !== challengeId) {
      res.status(409).json({ error: 'Another challenge is already active' });
      return;
    }

    if (active.rows.length > 0) {
      res.json({ userChallengeId: active.rows[0].id, started: false });
      return;
    }

    const created = await pool.query<{ id: number }>(
      `INSERT INTO user_challenges (user_id, challenge_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, challenge_id)
       DO UPDATE SET status = 'active', started_at = CURRENT_TIMESTAMP, finished_at = NULL
       RETURNING id`,
      [req.userId, challengeId]
    );

    res.status(201).json({ userChallengeId: created.rows[0].id, started: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start challenge' });
  }
});

/** Отметка задачи в активном челлендже. */
router.patch('/tasks/:taskId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const taskId = Number(req.params.taskId);
    const isDone = Boolean((req.body as { isDone?: unknown })?.isDone);

    if (!Number.isInteger(taskId)) {
      res.status(400).json({ error: 'Invalid task id' });
      return;
    }

    // Проверяем, что задача принадлежит активному челленджу этого пользователя.
    const owned = await pool.query<{ id: number; challenge_id: number }>(
      `SELECT uc.id, uc.challenge_id
         FROM user_challenges uc
         JOIN challenge_days d ON d.challenge_id = uc.challenge_id
         JOIN challenge_tasks t ON t.challenge_day_id = d.id
        WHERE uc.user_id = $1 AND uc.status = 'active' AND t.id = $2
        LIMIT 1`,
      [req.userId, taskId]
    );

    if (owned.rows.length === 0) {
      res.status(404).json({ error: 'Task is not in the active challenge' });
      return;
    }

    const { id: userChallengeId, challenge_id: challengeId } = owned.rows[0];

    await pool.query(
      `INSERT INTO user_task_progress (user_challenge_id, challenge_task_id, is_done, done_at)
       VALUES ($1, $2, $3, CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END)
       ON CONFLICT (user_challenge_id, challenge_task_id)
       DO UPDATE SET is_done = EXCLUDED.is_done, done_at = EXCLUDED.done_at`,
      [userChallengeId, taskId, isDone]
    );

    const days = await loadDays(challengeId, userChallengeId);
    const progress = summarize(days);

    res.json({ progress, days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/** Завершение челленджа. */
router.post('/active/finish', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE user_challenges
          SET status = 'finished', finished_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND status = 'active'
        RETURNING id`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No active challenge' });
      return;
    }

    res.json({ finished: true, userChallengeId: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to finish challenge' });
  }
});

export default router;
