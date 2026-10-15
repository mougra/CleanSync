import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware, optionalAuthMiddleware } from '../auth';
import { checkAndAwardAchievements } from '../services/achievementManager';
import { resolveContentLocale, type ContentLocale } from '../services/contentLocale';
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
const loadDays = async (
  challengeId: number,
  userChallengeId: number | null,
  locale: ContentLocale,
) => {
  const result = await pool.query<ProgressRow>(
    `SELECT d.id AS day_id, d.day_number,
            COALESCE(dt.title, d.title) AS day_title,
            COALESCE(dt.subtitle, d.subtitle) AS subtitle,
            t.id AS task_id, t.position,
            COALESCE(tt.title, t.title) AS title,
            COALESCE(tt.hint, t.hint) AS hint,
            COALESCE(tt.room, t.room) AS room,
            t.estimated_minutes, t.frequency,
            COALESCE(p.is_done, FALSE) AS is_done
       FROM challenge_days d
       LEFT JOIN challenge_day_translations dt
              ON dt.challenge_day_id = d.id AND dt.locale = $3
       LEFT JOIN challenge_tasks t ON t.challenge_day_id = d.id
       LEFT JOIN challenge_task_translations tt
              ON tt.challenge_task_id = t.id AND tt.locale = $3
       LEFT JOIN user_task_progress p
              ON p.challenge_task_id = t.id AND p.user_challenge_id = $2
      WHERE d.challenge_id = $1
      ORDER BY d.day_number, t.position`,
    [challengeId, userChallengeId, locale]
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

/**
 * Колонки карточки челленджа на языке запроса.
 *
 * Плейсхолдер языка передаём аргументом: в разных запросах он стоит под разным
 * номером (`$1`, `$2`), и зашитая константа столкнулась бы с их параметрами.
 * `COALESCE` оставляет русское значение там, где перевода ещё нет.
 */
const challengeColumns = (): string =>
  `c.id, c.slug,
   COALESCE(ct.title, c.title) AS title,
   COALESCE(ct.description, c.description) AS description,
   c.season, c.days_count, c.tasks_count, c.cover_url`;

const challengeTranslationJoin = (localePlaceholder: string): string =>
  `LEFT JOIN challenge_translations ct
          ON ct.challenge_id = c.id AND ct.locale = ${localePlaceholder}`;

/** Опубликованный челлендж текущего сезона. */
const findSeasonChallenge = async (
  season: Season,
  locale: ContentLocale,
): Promise<ChallengeRow | null> => {
  const result = await pool.query<ChallengeRow>(
    `SELECT ${challengeColumns()}
       FROM challenges c
       ${challengeTranslationJoin('$2')}
      WHERE c.season = $1 AND c.is_published = TRUE
      ORDER BY c.position, c.id
      LIMIT 1`,
    [season, locale]
  );

  return result.rows[0] ?? null;
};

/** Список опубликованных челленджей. */
router.get('/', async (req: Request, res: Response) => {
  try {
    const locale = resolveContentLocale(req);

    const result = await pool.query<ChallengeRow>(
      `SELECT ${challengeColumns()}
         FROM challenges c
         ${challengeTranslationJoin('$1')}
        WHERE c.is_published = TRUE
        ORDER BY c.position, c.id`,
      [locale]
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
    const locale = resolveContentLocale(req);

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
              c.id AS challenge_id, c.slug,
              COALESCE(ct.title, c.title) AS title,
              COALESCE(ct.description, c.description) AS description,
              c.season, c.days_count, c.tasks_count, c.cover_url
         FROM user_challenges uc
         JOIN challenges c ON c.id = uc.challenge_id
         ${challengeTranslationJoin('$2')}
        WHERE uc.user_id = $1 AND uc.status = 'active'
        ORDER BY uc.started_at DESC
        LIMIT 1`,
      [req.userId, locale]
    );

    if (userChallenge.rows.length === 0) {
      res.json({ active: null });
      return;
    }

    const row = userChallenge.rows[0];
    const days = await loadDays(row.challenge_id, row.id, locale);
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
 * Эндпоинт публичный: гостю он отдаёт карточку сезонного челленджа, чтобы тот
 * мог пройти его без аккаунта (отметки гостя живут в браузере, а при
 * регистрации или входе переносятся в аккаунт через `POST /:slug/sync`).
 * Авторизация здесь опциональная — `optionalAuthMiddleware` разбирает токен,
 * если он есть, но не требует его.
 *
 * Одна из четырёх форм ответа:
 *   { status: 'available', challenge, days, progress } — сезонный челлендж есть,
 *     но пользователь ещё ничего не отметил (в том числе гость без токена:
 *     тогда у всех задач `is_done: false`, `progress.done = 0`, а полей с
 *     пользовательскими данными в ответе нет вовсе);
 *   { status: 'active', challenge, days, progress } — отметки уже есть;
 *   { status: 'completed', finishedAt } — пользователь закрыл челлендж, до
 *     следующего сезона на главной его быть не должно;
 *   { status: 'none' } — для текущего сезона челленджа нет.
 *
 * Дни и прогресс отдаются в той же форме, что `GET /api/challenges/:slug`
 * и `GET /api/challenges/active`, чтобы фронтенд переиспользовал типы.
 */
router.get('/current', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const locale = resolveContentLocale(req);
    const season = seasonForDate();
    const challenge = await findSeasonChallenge(season, locale);

    if (!challenge) {
      res.json({ status: 'none', season });
      return;
    }

    // Гость: ни запроса к user_challenges, ни пользовательских полей в ответе.
    const userId = req.userId ?? null;

    if (userId === null) {
      const days = await loadDays(challenge.id, null, locale);

      res.json({
        status: 'available',
        season,
        challenge: challengeCard(challenge),
        progress: summarize(days),
        days,
      });
      return;
    }

    const userChallenge = await pool.query<UserChallengeRow>(
      `SELECT id, status, started_at, finished_at, completed_at
         FROM user_challenges
        WHERE user_id = $1 AND challenge_id = $2
        LIMIT 1`,
      [userId, challenge.id]
    );

    const row = userChallenge.rows[0];

    if (!row) {
      const days = await loadDays(challenge.id, null, locale);

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

    const days = await loadDays(challenge.id, row.id, locale);

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
    const locale = resolveContentLocale(req);

    const challenge = await pool.query<ChallengeRow>(
      `SELECT ${challengeColumns()}
         FROM challenges c
         ${challengeTranslationJoin('$2')}
        WHERE c.slug = $1 AND c.is_published = TRUE`,
      [req.params.slug, locale]
    );

    if (challenge.rows.length === 0) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }

    const row = challenge.rows[0];
    const days = await loadDays(row.id, null, locale);

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

    const days = await loadDays(challengeId, userChallengeId, resolveContentLocale(req));
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
 * Максимум отметок в одном запросе синхронизации. У сезонного челленджа
 * 20–24 задачи, так что 200 — заведомо с запасом; ограничение защищает от
 * запроса с массивом на сотни тысяч элементов.
 */
const SYNC_TASK_LIMIT = 200;

/**
 * Приводит тело запроса к списку целых id задач.
 *
 * Мусор отсекаем, а не отвергаем весь запрос: гость мог собрать отметки в
 * разных версиях фронтенда, и одна испорченная запись не должна ронять
 * перенос прогресса. Возврат `null` означает, что `taskIds` — не массив:
 * это уже ошибка клиента (400).
 */
const parseTaskIds = (raw: unknown): number[] | null => {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (!Array.isArray(raw)) {
    return null;
  }

  const ids = new Set<number>();

  for (const value of raw) {
    const id = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;

    if (!Number.isInteger(id) || id <= 0) {
      continue;
    }

    ids.add(id);

    if (ids.size >= SYNC_TASK_LIMIT) {
      break;
    }
  }

  return [...ids];
};

/**
 * Перенос гостевого прогресса в аккаунт: `POST /api/challenges/:slug/sync`.
 *
 * Гость проходит челлендж без регистрации, отметки лежат в его браузере, а
 * после регистрации или входа фронтенд присылает их сюда одним запросом.
 *
 * Правила:
 *   • авторизация обязательна (без токена 401) — переносить прогресс некуда;
 *   • принимаются только задачи этого челленджа; чужие id и мусор игнорируются
 *     (это не ошибка), массив обрезается до `SYNC_TASK_LIMIT` элементов;
 *   • отметки идемпотентны: повторный вызов не меняет прогресс, а `done_at`
 *     остаётся временем первой отметки;
 *   • запись `user_challenges` создаётся или возвращается в `active` — ровно
 *     как в `PATCH /tasks/:taskId`, включая проверку сезона: у пользователя без
 *     записи чужой сезон даёт 409;
 *   • пустой массив (или массив без задач этого челленджа) — не ошибка:
 *     отдаём текущее состояние, ничего не меняя и не создавая запись.
 *
 * Ответ — та же форма, что у `PATCH /tasks/:taskId`
 * (`{ userChallengeId, status, progress, days, awarded }`), чтобы фронтенду не
 * приходилось разбирать два разных ответа на одну и ту же операцию.
 */
router.post('/:slug/sync', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const taskIds = parseTaskIds((req.body as { taskIds?: unknown } | undefined)?.taskIds);

    if (taskIds === null) {
      res.status(400).json({ error: 'taskIds must be an array of numbers' });
      return;
    }

    const challenge = await client.query<{ id: number; season: string | null }>(
      'SELECT id, season FROM challenges WHERE slug = $1 AND is_published = TRUE',
      [req.params.slug]
    );

    if (challenge.rows.length === 0) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }

    const { id: challengeId, season } = challenge.rows[0];

    await client.query('BEGIN');

    // Оставляем только задачи этого челленджа: чужие id — не ошибка, их просто
    // не отмечаем. Список нужен ещё и для того, чтобы не создавать запись
    // user_challenges ради запроса, в котором нечего отмечать.
    const ownTasks =
      taskIds.length > 0
        ? await client.query<{ id: number }>(
            `SELECT t.id
               FROM challenge_tasks t
               JOIN challenge_days d ON d.id = t.challenge_day_id
              WHERE d.challenge_id = $1 AND t.id = ANY($2::int[])`,
            [challengeId, taskIds]
          )
        : { rows: [] as Array<{ id: number }> };

    const existing = await client.query<UserChallengeRow>(
      `SELECT id, status, started_at, finished_at, completed_at
         FROM user_challenges
        WHERE user_id = $1 AND challenge_id = $2
        LIMIT 1`,
      [req.userId, challengeId]
    );

    let userChallengeId: number | null = existing.rows[0]?.id ?? null;
    let userChallengeStatus = existing.rows[0]?.status ?? 'available';

    if (ownTasks.rows.length > 0) {
      if (userChallengeId === null) {
        const currentSeason = seasonForDate();

        if (season !== currentSeason) {
          await client.query('ROLLBACK');
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
      } else if (userChallengeStatus !== 'active') {
        // Челлендж был закрыт (или подвис) — перенос отметок снова делает его
        // активным, историю прогресса не трогаем: как в PATCH /tasks/:taskId.
        const reactivated = await client.query<{ id: number }>(
          `UPDATE user_challenges
              SET status = 'active', finished_at = NULL, completed_at = NULL
            WHERE id = $1
            RETURNING id`,
          [userChallengeId]
        );

        userChallengeId = reactivated.rows[0].id;
        userChallengeStatus = 'active';
      }

      // Один запрос на все отметки. `COALESCE` в DO UPDATE сохраняет время
      // первой отметки: повторная синхронизация ничего не переписывает.
      await client.query(
        `INSERT INTO user_task_progress (user_challenge_id, challenge_task_id, is_done, done_at)
         SELECT $1, t.id, TRUE, CURRENT_TIMESTAMP
           FROM challenge_tasks t
           JOIN challenge_days d ON d.id = t.challenge_day_id
          WHERE d.challenge_id = $2 AND t.id = ANY($3::int[])
         ON CONFLICT (user_challenge_id, challenge_task_id)
         DO UPDATE SET is_done = TRUE,
                       done_at = COALESCE(user_task_progress.done_at, EXCLUDED.done_at)`,
        [userChallengeId, challengeId, ownTasks.rows.map((row) => row.id)]
      );
    }

    await client.query('COMMIT');

    const days = await loadDays(challengeId, userChallengeId, resolveContentLocale(req));
    const progress = summarize(days);

    // Перенос отметок — такая же активность, как обычная отметка задачи.
    const awarded = ownTasks.rows.length > 0 ? await checkAndAwardAchievements(String(req.userId)) : [];

    res.json({
      userChallengeId,
      status: userChallengeStatus,
      progress,
      days,
      awarded,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(err);
    res.status(500).json({ error: 'Failed to sync challenge progress' });
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
