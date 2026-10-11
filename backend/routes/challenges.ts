import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { checkAndAwardAchievements } from '../services/achievementManager';
import { Season, seasonForDate, seasonTitle } from '../services/seasons';

const router = express.Router();

interface ChallengeRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  season: string | null;
  days_count: number;
  tasks_count: number;
  cover_url: string | null;
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
  frequency: string | null;
  is_done: boolean | null;
}

interface UserChallengeRow {
  id: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  completed_at: string | null;
}

/** Дни с задачами и отметками пользователя — собираем из плоской выборки. */
const loadDays = async (challengeId: number, userChallengeId: number | null) => {
  const result = await pool.query<ProgressRow>(
    `SELECT d.id AS day_id, d.day_number, d.title AS day_title, d.subtitle,
            t.id AS task_id, t.position, t.title, t.hint, t.room, t.estimated_minutes, t.frequency,
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
      frequency: string;
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
        frequency: row.frequency ?? 'once',
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

/**
 * Карточка челленджа в ответах API. Держим её в одном месте: раньше объект
 * собирался по месту в трёх эндпоинтах и поля успели разойтись.
 */
const challengeCard = (row: ChallengeRow) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  season: row.season,
  days_count: row.days_count,
  tasks_count: row.tasks_count,
  cover_url: row.cover_url,
});

const CHALLENGE_COLUMNS = `id, slug, title, description, season, days_count, tasks_count, cover_url`;

/** Опубликованный челлендж текущего сезона. */
const findSeasonChallenge = async (
  season: Season
): Promise<ChallengeRow | null> => {
  const result = await pool.query<ChallengeRow>(
    `SELECT ${CHALLENGE_COLUMNS}
       FROM challenges
      WHERE season = $1 AND is_published = TRUE
      ORDER BY position, id
      LIMIT 1`,
    [season]
  );

  return result.rows[0] ?? null;
};

/** Список опубликованных челленджей. */
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query<ChallengeRow>(
      `SELECT ${CHALLENGE_COLUMNS}
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
 *
 * Объявлен до `/:slug`, иначе 'active' попадёт в параметр.
 * Завершённые сюда не попадают: их место — `GET /api/challenges/current`.
 */
router.get('/active', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userChallenge = await pool.query<
      UserChallengeRow & {
        challenge_id: number;
        slug: string;
        title: string;
        description: string | null;
        season: string | null;
        days_count: number;
        tasks_count: number;
        cover_url: string | null;
      }
    >(
      `SELECT uc.id, uc.status, uc.started_at, uc.finished_at, uc.completed_at,
              c.id AS challenge_id, c.slug, c.title, c.description, c.season,
              c.days_count, c.tasks_count, c.cover_url
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
        status: row.status,
        startedAt: row.started_at,
        challenge: {
          id: row.challenge_id,
          slug: row.slug,
          title: row.title,
          description: row.description,
          season: row.season,
          days_count: row.days_count,
          tasks_count: row.tasks_count,
          cover_url: row.cover_url,
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

/**
 * Челлендж текущего сезона для главной.
 *
 * Одна из трёх форм ответа:
 *   { status: 'available', challenge, days, progress } — сезонный челлендж есть,
 *     но пользователь ещё ничего не отметил: фронт показывает карточку, отметки
 *     доступны сразу (отдельной кнопки «начать» больше нет);
 *   { status: 'active', challenge, days, progress } — отметки уже есть;
 *   { status: 'completed', finishedAt } — пользователь закрыл челлендж, до
 *     следующего сезона на главной его быть не должно;
 *   { status: 'none' } — для текущего сезона челленджа нет.
 *
 * Дни и прогресс отдаются в той же форме, что `GET /api/challenges/:slug`
 * и `GET /api/challenges/active`, чтобы фронтенд переиспользовал типы.
 */
router.get('/current', authMiddleware, async (req: Request, res: Response) => {
  try {
    const season = seasonForDate();
    const challenge = await findSeasonChallenge(season);

    if (!challenge) {
      res.json({ status: 'none', season });
      return;
    }

    const userChallenge = await pool.query<UserChallengeRow>(
      `SELECT id, status, started_at, finished_at, completed_at
         FROM user_challenges
        WHERE user_id = $1 AND challenge_id = $2
        LIMIT 1`,
      [req.userId, challenge.id]
    );

    const row = userChallenge.rows[0];

    if (!row) {
      const days = await loadDays(challenge.id, null);

      res.json({
        status: 'available',
        season,
        challenge: challengeCard(challenge),
        progress: summarize(days),
        days,
      });
      return;
    }

    if (row.status === 'completed' || row.status === 'finished') {
      res.json({
        status: 'completed',
        season,
        challengeSlug: challenge.slug,
        finishedAt: row.completed_at ?? row.finished_at ?? null,
      });
      return;
    }

    const days = await loadDays(challenge.id, row.id);

    res.json({
      status: 'active',
      season,
      userChallengeId: row.id,
      startedAt: row.started_at,
      challenge: challengeCard(challenge),
      progress: summarize(days),
      days,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch current challenge' });
  }
});

/** Детали челленджа: дни и задачи. Прогресс подмешивается, если пользователь вошёл. */
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const challenge = await pool.query<ChallengeRow>(
      `SELECT ${CHALLENGE_COLUMNS}
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

/**
 * Старт челленджа. Оставлен для совместимости: теперь отметка задачи работает
 * и без него (см. PATCH /tasks/:taskId), а на главной кнопки «начать» нет.
 * Повторный старт того же челленджа идемпотентен.
 */
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

    const created = await pool.query<{ id: number }>(
      `INSERT INTO user_challenges (user_id, challenge_id, status, started_at, finished_at, completed_at)
       VALUES ($1, $2, 'active', CURRENT_TIMESTAMP, NULL, NULL)
       ON CONFLICT (user_id, challenge_id)
       DO UPDATE SET status = 'active', started_at = CURRENT_TIMESTAMP,
                     finished_at = NULL, completed_at = NULL
       RETURNING id`,
      [req.userId, challengeId]
    );

    res.status(201).json({ userChallengeId: created.rows[0].id, started: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start challenge' });
  }
});

/**
 * Отметка задачи челленджа — работает сразу, без отдельного «старта».
 *
 * Раньше здесь требовался `uc.status = 'active'`, то есть запись user_challenges
 * должна была существовать заранее: без кнопки «начать» отметка отвечала 404.
 * Теперь запись создаётся (или возвращается в active) прямо при первой отметке.
 *
 * Правила:
 *   • отметку принимает челлендж, по которому у пользователя есть незакрытая
 *     запись — независимо от сезона (начатое можно доделать);
 *   • если записи нет, отметка разрешена только для челленджа текущего сезона:
 *     челлендж будущего сезона открывать вручную нельзя, это ответ 409;
 *   • если пользователь закрыл челлендж (completed), новая отметка снова делает
 *     его активным — идемпотентно, без ошибки: история прогресса сохраняется.
 */
router.patch('/tasks/:taskId', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const taskId = Number(req.params.taskId);
    const isDone = Boolean((req.body as { isDone?: unknown })?.isDone);

    if (!Number.isInteger(taskId)) {
      res.status(400).json({ error: 'Invalid task id' });
      return;
    }

    const task = await client.query<{
      challenge_id: number;
      season: string | null;
      is_published: boolean;
    }>(
      `SELECT c.id AS challenge_id, c.season, c.is_published
         FROM challenge_tasks t
         JOIN challenge_days d ON d.id = t.challenge_day_id
         JOIN challenges c ON c.id = d.challenge_id
        WHERE t.id = $1`,
      [taskId]
    );

    if (task.rows.length === 0) {
      res.status(404).json({ error: 'Challenge task not found' });
      return;
    }

    const { challenge_id: challengeId, season } = task.rows[0];

    const existing = await client.query<UserChallengeRow>(
      `SELECT id, status, started_at, finished_at, completed_at
         FROM user_challenges
        WHERE user_id = $1 AND challenge_id = $2
        LIMIT 1`,
      [req.userId, challengeId]
    );

    let userChallengeId: number;
    let userChallengeStatus: string;

    if (existing.rows.length > 0) {
      const row = existing.rows[0];

      if (row.status === 'active') {
        userChallengeId = row.id;
        userChallengeStatus = row.status;
      } else {
        // Завершённый или подвисший челлендж пользователь продолжает отмечать:
        // возвращаем запись в active, историю отметок не трогаем.
        const reactivated = await client.query<{ id: number }>(
          `UPDATE user_challenges
              SET status = 'active', finished_at = NULL, completed_at = NULL
            WHERE id = $1
            RETURNING id`,
          [row.id]
        );

        userChallengeId = reactivated.rows[0].id;
        userChallengeStatus = 'active';
      }
    } else {
      const currentSeason = seasonForDate();

      if (season !== currentSeason) {
        res.status(409).json({
          error: 'Challenge is not available this season',
          season: currentSeason,
          challengeSeason: season,
          message: `Этот челлендж относится к сезону «${season ? seasonTitle(season as Season) : 'без сезона'}», сейчас сезон «${seasonTitle(currentSeason)}»`,
        });
        return;
      }

      const created = await client.query<{ id: number }>(
        `INSERT INTO user_challenges (user_id, challenge_id, status, started_at)
         VALUES ($1, $2, 'active', CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, challenge_id)
         DO UPDATE SET status = 'active', started_at = CURRENT_TIMESTAMP,
                       finished_at = NULL, completed_at = NULL
         RETURNING id`,
        [req.userId, challengeId]
      );

      userChallengeId = created.rows[0].id;
      userChallengeStatus = 'active';
    }

    await client.query(
      `INSERT INTO user_task_progress (user_challenge_id, challenge_task_id, is_done, done_at)
       VALUES ($1, $2, $3, CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END)
       ON CONFLICT (user_challenge_id, challenge_task_id)
       DO UPDATE SET is_done = EXCLUDED.is_done, done_at = EXCLUDED.done_at`,
      [userChallengeId, taskId, isDone]
    );

    const days = await loadDays(challengeId, userChallengeId);
    const progress = summarize(days);

    // Отметка задачи в челлендже тоже двигает достижения.
    const awarded = await checkAndAwardAchievements(String(req.userId));

    res.json({
      userChallengeId,
      status: userChallengeStatus,
      progress,
      days,
      awarded,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  } finally {
    client.release();
  }
});

/**
 * Завершение челленджа: «пройден» для пользователя.
 *
 * Идемпотентно: повторный вызов не падает, а сообщает, что челлендж уже закрыт
 * (`finished: false`, `alreadyFinished: true`) и когда это произошло. Так фронт
 * может спокойно повторить запрос после сетевой ошибки.
 *
 * `:slug` можно не указывать; если указан — закрываем именно его, иначе
 * закрывается активный челлендж пользователя.
 */
const finishChallenge = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const slug = typeof req.params.slug === 'string' ? req.params.slug : null;
    const finishedAt = new Date().toISOString();

    await client.query('BEGIN');

    let challengeId: number | null = null;

    if (slug) {
      const challenge = await client.query<{ id: number }>(
        'SELECT id FROM challenges WHERE slug = $1 AND is_published = TRUE',
        [slug]
      );

      if (challenge.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Challenge not found' });
        return;
      }

      challengeId = challenge.rows[0].id;
    }

    const updated = await client.query<{ id: number; completed_at: string | null }>(
      `UPDATE user_challenges
          SET status = 'completed',
              finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
              completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
        WHERE user_id = $1
          AND status = 'active'
          AND ($2::int IS NULL OR challenge_id = $2)
        RETURNING id, completed_at`,
      [req.userId, challengeId]
    );

    if (updated.rows.length > 0) {
      await client.query('COMMIT');

      res.json({
        finished: true,
        alreadyFinished: false,
        userChallengeId: updated.rows[0].id,
        finishedAt: updated.rows[0].completed_at ?? finishedAt,
      });
      return;
    }

    // Активного нет — возможно, челлендж уже закрыт: отвечаем тем же по смыслу.
    const completed = await client.query<{ id: number; completed_at: string | null }>(
      `SELECT id, completed_at
         FROM user_challenges
        WHERE user_id = $1
          AND status IN ('completed', 'finished')
          AND ($2::int IS NULL OR challenge_id = $2)
        ORDER BY COALESCE(completed_at, finished_at) DESC NULLS LAST, id DESC
        LIMIT 1`,
      [req.userId, challengeId]
    );

    await client.query('COMMIT');

    if (completed.rows.length > 0) {
      res.json({
        finished: false,
        alreadyFinished: true,
        userChallengeId: completed.rows[0].id,
        finishedAt: completed.rows[0].completed_at ?? null,
      });
      return;
    }

    res.status(404).json({ error: 'No active challenge', finished: false });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(err);
    res.status(500).json({ error: 'Failed to finish challenge' });
  } finally {
    client.release();
  }
};

router.post('/active/finish', authMiddleware, finishChallenge);
router.post('/:slug/finish', authMiddleware, finishChallenge);

export default router;
