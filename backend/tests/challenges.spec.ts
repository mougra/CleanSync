import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db';
import { generateTokens } from '../auth';
import { seasonForDate } from '../services/seasons';

/**
 * Гостевой режим челленджей: `GET /api/challenges/current` публичный, а отметки,
 * накопленные гостем в браузере, переносятся в аккаунт через
 * `POST /api/challenges/:slug/sync`.
 *
 * Тесты работают с настоящей базой (как CI и `npm run db:setup`): им нужен
 * опубликованный челлендж текущего сезона с задачами. Если базы или данных нет,
 * весь блок пропускается, а не падает: остальные тесты набора к базе
 * необязательны (см. tests/health.spec.ts).
 */

interface Fixture {
  userId: number;
  token: string;
  slug: string;
  season: string;
  /** Четыре первые задачи сезонного челленджа — их «отмечал» гость. */
  taskIds: number[];
  /** Задача другого челленджа и его slug — проверка «чужие id игнорируются». */
  foreignTaskId: number | null;
  foreignSlug: string | null;
}

const TEST_EMAIL_PREFIX = 'challenges-spec-';

const createFixture = async (): Promise<Fixture | null> => {
  const season = seasonForDate();

  const challenge = await pool.query<{ id: number; slug: string }>(
    `SELECT id, slug
       FROM challenges
      WHERE season = $1 AND is_published = TRUE
      ORDER BY position, id
      LIMIT 1`,
    [season]
  );

  if (challenge.rows.length === 0) {
    return null;
  }

  const { id: challengeId, slug } = challenge.rows[0];

  const tasks = await pool.query<{ id: number }>(
    `SELECT t.id
       FROM challenge_tasks t
       JOIN challenge_days d ON d.id = t.challenge_day_id
      WHERE d.challenge_id = $1
      ORDER BY d.day_number, t.position`,
    [challengeId]
  );

  // Нужны минимум четыре задачи: три для переноса и одна «на досыпку».
  if (tasks.rows.length < 4) {
    return null;
  }

  const other = await pool.query<{ id: number; slug: string }>(
    `SELECT c.id, c.slug
       FROM challenges c
      WHERE c.is_published = TRUE
        AND c.season IS DISTINCT FROM $1
        AND EXISTS (SELECT 1 FROM challenge_days d WHERE d.challenge_id = c.id)
      ORDER BY c.position, c.id
      LIMIT 1`,
    [season]
  );

  let foreignTaskId: number | null = null;
  let foreignSlug: string | null = null;

  if (other.rows.length > 0) {
    foreignSlug = other.rows[0].slug;

    const foreignTask = await pool.query<{ id: number }>(
      `SELECT t.id
         FROM challenge_tasks t
         JOIN challenge_days d ON d.id = t.challenge_day_id
        WHERE d.challenge_id = $1
        ORDER BY d.day_number, t.position
        LIMIT 1`,
      [other.rows[0].id]
    );

    foreignTaskId = foreignTask.rows[0]?.id ?? null;
  }

  // Пароль здесь не проверяется: тесту нужен валидный access-токен, а не вход.
  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password)
     VALUES ($1, $2)
     RETURNING id`,
    [`${TEST_EMAIL_PREFIX}${Date.now()}@example.com`, 'test-password-hash']
  );

  const userId = user.rows[0].id;

  return {
    userId,
    token: generateTokens(String(userId)).accessToken,
    slug,
    season,
    taskIds: tasks.rows.slice(0, 4).map((row) => row.id),
    foreignTaskId,
    foreignSlug,
  };
};

const dbReady = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch(() => false);

const fixture: Fixture | null = dbReady
  ? await createFixture().catch((err: unknown) => {
      console.error('Не удалось подготовить данные для тестов челленджей', err);
      return null;
    })
  : null;

afterAll(async () => {
  // Пользователя удаляем вместе с прогрессом: user_challenges и
  // user_task_progress уходят каскадом.
  if (fixture) {
    await pool.query('DELETE FROM users WHERE id = $1', [fixture.userId]).catch(() => undefined);
  }

  await pool.end();
});

/** Фикстура заведомо есть: без неё блок ниже пропускается через skipIf. */
const need = (): Fixture => {
  if (!fixture) {
    throw new Error('Нет данных для теста: база или сид недоступны');
  }

  return fixture;
};

/** Тест, который получает подготовленные данные аргументом. */
const itWithData = (name: string, fn: (data: Fixture) => Promise<void>) =>
  it(name, async () => {
    await fn(need());
  });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** id записи пользователя по челленджу: сверяем идемпотентность переноса. */
let syncedUserChallengeId: number | null = null;

describe.skipIf(!fixture)('GET /api/challenges/current без авторизации', () => {
  itWithData('отдаёт available с нулевым прогрессом и без пользовательских данных', async (data) => {
    const res = await request(app).get('/api/challenges/current');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('available');
    expect(res.body.season).toBe(data.season);
    expect(res.body.challenge.slug).toBe(data.slug);
    expect(res.body.progress.done).toBe(0);
    expect(res.body.progress.total).toBeGreaterThan(0);

    const tasks = res.body.days.flatMap((day: { tasks: Array<{ is_done: boolean }> }) => day.tasks);

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task: { is_done: boolean }) => task.is_done === false)).toBe(true);

    // Гость не должен получить ни одной привязки к чужому аккаунту.
    expect(res.body).not.toHaveProperty('userChallengeId');
    expect(res.body).not.toHaveProperty('startedAt');
  });

  itWithData('мусорный токен не даёт 401: запрос остаётся гостевым', async (data) => {
    const res = await request(app)
      .get('/api/challenges/current')
      .set('Authorization', 'Bearer not-a-jwt');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('available');
    expect(res.body.season).toBe(data.season);
    expect(res.body.progress.done).toBe(0);
  });

  itWithData('с токеном без отметок тоже отдаёт available', async (data) => {
    const res = await request(app).get('/api/challenges/current').set(auth(data.token));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('available');
    expect(res.body.progress.done).toBe(0);
    expect(res.body).not.toHaveProperty('userChallengeId');
  });
});

describe.skipIf(!fixture)('POST /api/challenges/:slug/sync', () => {
  itWithData('без токена отвечает 401', async (data) => {
    const res = await request(app)
      .post(`/api/challenges/${data.slug}/sync`)
      .send({ taskIds: data.taskIds.slice(0, 3) });

    expect(res.status).toBe(401);
  });

  itWithData('переносит гостевые отметки и создаёт запись пользователя', async (data) => {
    const res = await request(app)
      .post(`/api/challenges/${data.slug}/sync`)
      .set(auth(data.token))
      .send({ taskIds: data.taskIds.slice(0, 3) });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.progress.done).toBe(3);
    expect(res.body.userChallengeId).toEqual(expect.any(Number));
    expect(Array.isArray(res.body.awarded)).toBe(true);

    const done = res.body.days
      .flatMap((day: { tasks: Array<{ id: number; is_done: boolean }> }) => day.tasks)
      .filter((task: { is_done: boolean }) => task.is_done)
      .map((task: { id: number }) => task.id);

    expect(done.sort()).toEqual([...data.taskIds.slice(0, 3)].sort());

    syncedUserChallengeId = res.body.userChallengeId as number;
  });

  itWithData('идемпотентен: повторный вызов не меняет прогресс', async (data) => {
    const res = await request(app)
      .post(`/api/challenges/${data.slug}/sync`)
      .set(auth(data.token))
      .send({ taskIds: data.taskIds.slice(0, 3) });

    expect(res.status).toBe(200);
    expect(res.body.progress.done).toBe(3);
    expect(res.body.userChallengeId).toBe(syncedUserChallengeId);
  });

  itWithData('прогресс виден в /current с токеном', async (data) => {
    const res = await request(app).get('/api/challenges/current').set(auth(data.token));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.progress.done).toBe(3);
    expect(res.body.userChallengeId).toBe(syncedUserChallengeId);
  });

  itWithData('чужие id игнорируются', async (data) => {
    const stranger = data.foreignTaskId ?? 99_999_999;

    const res = await request(app)
      .post(`/api/challenges/${data.slug}/sync`)
      .set(auth(data.token))
      .send({ taskIds: [stranger, 99_999_998] });

    expect(res.status).toBe(200);
    expect(res.body.progress.done).toBe(3);
    expect(res.body.userChallengeId).toBe(syncedUserChallengeId);
  });

  itWithData('мусор в массиве отсекается, запрос не падает', async (data) => {
    const res = await request(app)
      .post(`/api/challenges/${data.slug}/sync`)
      .set(auth(data.token))
      .send({ taskIds: ['abc', null, true, {}, -1, 0] });

    expect(res.status).toBe(200);
    expect(res.body.progress.done).toBe(3);
  });

  itWithData('пустой массив — не ошибка, состояние не меняется', async (data) => {
    const res = await request(app)
      .post(`/api/challenges/${data.slug}/sync`)
      .set(auth(data.token))
      .send({ taskIds: [] });

    expect(res.status).toBe(200);
    expect(res.body.progress.done).toBe(3);
    expect(res.body.status).toBe('active');
    expect(res.body.userChallengeId).toBe(syncedUserChallengeId);
    expect(res.body.awarded).toEqual([]);
  });

  itWithData('taskIds не массив — 400', async (data) => {
    const res = await request(app)
      .post(`/api/challenges/${data.slug}/sync`)
      .set(auth(data.token))
      .send({ taskIds: 'not-an-array' });

    expect(res.status).toBe(400);
  });

  itWithData('неизвестный slug — 404', async (data) => {
    const res = await request(app)
      .post('/api/challenges/no-such-challenge/sync')
      .set(auth(data.token))
      .send({ taskIds: data.taskIds.slice(0, 1) });

    expect(res.status).toBe(404);
  });

  it.skipIf(!fixture?.foreignSlug)('челлендж чужого сезона без записи — 409 с пояснением', async () => {
    const data = need();

    const res = await request(app)
      .post(`/api/challenges/${data.foreignSlug}/sync`)
      .set(auth(data.token))
      .send({ taskIds: data.foreignTaskId === null ? [] : [data.foreignTaskId] });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Challenge is not available this season');
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  itWithData('досыпает новые отметки к уже перенесённым', async (data) => {
    const res = await request(app)
      .post(`/api/challenges/${data.slug}/sync`)
      .set(auth(data.token))
      .send({ taskIds: [data.taskIds[3]] });

    expect(res.status).toBe(200);
    expect(res.body.progress.done).toBe(4);
    expect(res.body.userChallengeId).toBe(syncedUserChallengeId);
  });
});
