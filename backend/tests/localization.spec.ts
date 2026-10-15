import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db';
import { generateTokens } from '../auth';
import { ACHIEVEMENT_EN } from '../content/en/achievements';
import { CHALLENGE_EN } from '../content/en/challenges';
import { HABIT_TEMPLATE_EN } from '../content/en/habits';
import { CATALOG_TITLE_EN } from '../content/en/taskCatalog';

/**
 * Язык контента, который лежит в базе.
 *
 * Интерфейс переводит i18n на клиенте, а названия челленджей, достижений,
 * привычек и сгенерированных задач приходят из API готовыми строками. Значит,
 * сервер обязан понимать язык запроса: `Accept-Language` (его подставляет
 * `useApi`) либо явный `?locale=`.
 *
 * Тесты работают с настоящей базой: им нужны засеянные справочники. Если базы
 * или данных нет, блок пропускается, а не падает — как в остальных тестах набора.
 */

const TEST_EMAIL_PREFIX = 'localization-spec-';

const dbReady = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch(() => false);

const createdUsers: number[] = [];

const createUser = async (): Promise<{ userId: number; token: string }> => {
  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password)
     VALUES ($1, $2)
     RETURNING id`,
    [`${TEST_EMAIL_PREFIX}${Date.now()}-${createdUsers.length}@example.com`, 'test-password-hash'],
  );

  const userId = user.rows[0].id;
  createdUsers.push(userId);

  return { userId, token: generateTokens(String(userId)).accessToken };
};

describe.skipIf(!dbReady)('Язык справочников в API', () => {
  it('достижения: заголовок Accept-Language выбирает язык названий', async () => {
    const english = await request(app)
      .get('/api/achievements')
      .set('Accept-Language', 'en-US,en;q=0.9');
    const russian = await request(app)
      .get('/api/achievements')
      .set('Accept-Language', 'ru-RU,ru;q=0.9');

    expect(english.status).toBe(200);

    const englishFirst = english.body.find((row: { code: string }) => row.code === 'first_step');
    const russianFirst = russian.body.find((row: { code: string }) => row.code === 'first_step');

    expect(englishFirst.name).toBe(ACHIEVEMENT_EN.first_step.name);
    expect(russianFirst.name).not.toBe(ACHIEVEMENT_EN.first_step.name);
  });

  it('явный ?locale= важнее заголовка, а незнакомый язык даёт русский', async () => {
    const explicit = await request(app)
      .get('/api/achievements?locale=en')
      .set('Accept-Language', 'ru-RU,ru;q=0.9');
    const unknown = await request(app)
      .get('/api/achievements')
      .set('Accept-Language', 'de-DE,de;q=0.9');

    const explicitFirst = explicit.body.find((row: { code: string }) => row.code === 'first_step');
    const unknownFirst = unknown.body.find((row: { code: string }) => row.code === 'first_step');

    expect(explicitFirst.name).toBe(ACHIEVEMENT_EN.first_step.name);
    expect(unknownFirst.name).not.toBe(ACHIEVEMENT_EN.first_step.name);
  });

  it('челлендж: карточка, день и задача приходят на английском', async () => {
    const list = await request(app).get('/api/challenges').set('Accept-Language', 'en');

    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);

    const slug = list.body[0].slug as string;
    const translation = CHALLENGE_EN[slug];

    expect(translation).toBeDefined();
    expect(list.body[0].title).toBe(translation.title);

    const details = await request(app)
      .get(`/api/challenges/${slug}`)
      .set('Accept-Language', 'en');
    const firstDay = details.body.days[0];
    const firstTask = firstDay.tasks[0];
    const dayTranslation = translation.days[String(firstDay.day_number)];
    const translatedTaskTitles = Object.values(dayTranslation.tasks).map((task) => task.title);

    expect(firstDay.title).toBe(dayTranslation.title);
    // Ключ перевода — русское название задачи, а в ответе она уже английская:
    // поэтому сверяем не ключ, а сам перевод из словаря.
    expect(translatedTaskTitles).toContain(firstTask.title);
    expect(firstTask.title).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('привычки: каталог и зона на английском', async () => {
    const english = await request(app)
      .get('/api/habits/templates')
      .set('Accept-Language', 'en');

    expect(english.status).toBe(200);
    expect(english.body.length).toBeGreaterThan(0);

    const template = english.body.find((row: { slug: string }) => row.slug === 'five-minutes-kitchen');

    expect(template.title).toBe(HABIT_TEMPLATE_EN['five-minutes-kitchen'].title);
    // Зона — словарь: в базе она русская, а в ответе английского запроса английская.
    expect(template.zone).toBe('Kitchen');
  });
});

describe.skipIf(!dbReady)('Язык сгенерированного набора задач', () => {
  it('набор собирается русскими названиями, но читается на языке запроса', async () => {
    const { token } = await createUser();

    const locale = await request(app)
      .put('/api/auth/locale')
      .set('Authorization', `Bearer ${token}`)
      .send({ locale: 'en' });

    expect(locale.status).toBe(200);

    // Анкета без ответов: генератор берёт «типовой дом» и собирает «Мои задачи».
    const profile = await request(app)
      .put('/api/home-profile')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'en')
      .send({ complete: true });

    expect(profile.status).toBe(200);

    const schedules = await request(app)
      .get('/api/schedules')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'en');

    const scheduleId = schedules.body[0]?.id as number;

    expect(scheduleId).toBeTruthy();

    const english = await request(app)
      .get(`/api/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'en');
    const russian = await request(app)
      .get(`/api/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'ru');

    const englishTitles = english.body.tasks.map((task: { title: string }) => task.title);
    const russianTitles = russian.body.tasks.map((task: { title: string }) => task.title);

    expect(englishTitles.length).toBeGreaterThan(0);
    expect(englishTitles.length).toBe(russianTitles.length);

    // Английские названия — значения словаря каталога, русские — его ключи.
    // Так проверка не зависит от того, какие именно задачи выбрал генератор.
    const englishValues = new Set(Object.values(CATALOG_TITLE_EN));

    for (const title of englishTitles) {
      expect(englishValues.has(title), `не английское название: ${title}`).toBe(true);
    }

    const russianKeys = new Set(Object.keys(CATALOG_TITLE_EN));

    for (const title of russianTitles) {
      expect(russianKeys.has(title), `не русское название: ${title}`).toBe(true);
    }

    // Название самого расписания тоже переводится («Мои задачи» / «My tasks»).
    expect(russian.body.title).toBe('Мои задачи');
    expect(english.body.title).toBe('My tasks');
  });
});

afterAll(async () => {
  for (const userId of createdUsers) {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => undefined);
  }

  await pool.end();
});
