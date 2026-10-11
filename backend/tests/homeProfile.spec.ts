import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db';
import { generateTokens } from '../auth';

/**
 * Прогресс анкеты «Настройка по дому».
 *
 * В таблице `home_profiles` ответы лежат в колонках `NOT NULL DEFAULT`, поэтому
 * `GET /api/home-profile` отдаёт профиль уже с подставленными значениями: по ним
 * нельзя отличить «человек выбрал» от «шаг пропустили». Имена явно присланных
 * полей копит `answered_fields` (миграция 0015), и наружу они уходят как
 * `answeredFields` — по этому списку интерфейс считает «N из 12».
 *
 * Тесты работают с настоящей базой, как CI и `npm run db:setup`. Если базы нет,
 * весь блок пропускается, а не падает (см. tests/challenges.spec.ts).
 */

interface Fixture {
  userId: number;
  token: string;
}

/**
 * Все поля анкеты в том порядке, в каком их отдаёт сервер: SQL объединяет список
 * через `array_agg(DISTINCT name ORDER BY name)`, то есть по алфавиту.
 */
const ALL_FIELDS = [
  'cleaningDays',
  'cleaningLevel',
  'cleaningStyle',
  'composition',
  'dailyMinutes',
  'drying',
  'hardestZone',
  'hasGarage',
  'hasKidsRoom',
  'housingType',
  'outdoor',
  'pets',
  'rooms',
  'worksFromHome',
];

/** Полный набор ответов: с ним анкета считается пройденной (`complete: true`). */
const FULL_ANSWERS: Record<string, unknown> = {
  housingType: 'house',
  rooms: '5-7',
  composition: 'family_kids',
  pets: ['cats'],
  outdoor: 'yard',
  hasKidsRoom: true,
  hasGarage: false,
  worksFromHome: true,
  drying: 'dryer',
  cleaningLevel: 'deep',
  dailyMinutes: '1to2h',
  cleaningStyle: 'often_small',
  cleaningDays: [1, 4, 6],
  hardestZone: 'kitchen',
};

const TEST_EMAIL_PREFIX = 'home-profile-spec-';

const createFixture = async (): Promise<Fixture> => {
  // Пароль здесь не проверяется: тесту нужен валидный access-токен, а не вход.
  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password)
     VALUES ($1, $2)
     RETURNING id`,
    [`${TEST_EMAIL_PREFIX}${Date.now()}@example.com`, 'test-password-hash']
  );

  const userId = user.rows[0].id;

  return { userId, token: generateTokens(String(userId)).accessToken };
};

const dbReady = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch(() => false);

const fixture: Fixture | null = dbReady
  ? await createFixture().catch((err: unknown) => {
      console.error('Не удалось подготовить пользователя для тестов анкеты о доме', err);
      return null;
    })
  : null;

afterAll(async () => {
  // Профиль, расписания и задачи уходят каскадом вместе с пользователем.
  if (fixture) {
    await pool.query('DELETE FROM users WHERE id = $1', [fixture.userId]).catch(() => undefined);
  }

  await pool.end();
});

/** Фикстура заведомо есть: без неё блоки ниже пропускаются через skipIf. */
const need = (): Fixture => {
  if (!fixture) {
    throw new Error('Нет данных для теста: база недоступна');
  }

  return fixture;
};

/** Тест, который получает подготовленные данные аргументом. */
const itWithData = (name: string, fn: (data: Fixture) => Promise<void>) =>
  it(name, async () => {
    await fn(need());
  });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const getProfile = (token: string) => request(app).get('/api/home-profile').set(auth(token));

const putProfile = (token: string, body: Record<string, unknown>) =>
  request(app).put('/api/home-profile').set(auth(token)).send(body);

describe.skipIf(!fixture)('GET /api/home-profile без профиля', () => {
  itWithData('отдаёт пустой список явно заполненных полей', async (data) => {
    const res = await getProfile(data.token);

    expect(res.status).toBe(200);
    expect(res.body.profile).toBeNull();
    expect(res.body.completed).toBe(false);
    expect(res.body.answeredFields).toEqual([]);
  });
});

describe.skipIf(!fixture)('PUT /api/home-profile: список отвеченных полей растёт', () => {
  itWithData('три поля → в ответе ровно эти три', async (data) => {
    const res = await putProfile(data.token, { housingType: 'house', rooms: '5-7', pets: ['cats'] });

    expect(res.status).toBe(200);
    // Порядок задаёт SQL (алфавитный), поэтому список сравниваем целиком.
    expect(res.body.answeredFields).toEqual(['housingType', 'pets', 'rooms']);
    expect(res.body.completed).toBe(false);

    // Значения по умолчанию по-прежнему подставляются: прогресс — это отдельная
    // информация, а не признак того, что остальные поля кто-то заполнил.
    expect(res.body.profile.cleaningDays).toEqual([0, 3, 6]);
    expect(res.body.answeredFields).not.toContain('cleaningDays');
  });

  itWithData('два новых поля добавляются, прежние остаются на месте', async (data) => {
    const res = await putProfile(data.token, { outdoor: 'balcony', dailyMinutes: '1to2h' });

    expect(res.status).toBe(200);
    expect(res.body.answeredFields).toEqual([
      'dailyMinutes',
      'housingType',
      'outdoor',
      'pets',
      'rooms',
    ]);
  });

  itWithData('повторная отправка тех же полей не создаёт дублей', async (data) => {
    const res = await putProfile(data.token, { outdoor: 'yard', dailyMinutes: '30to60' });

    expect(res.status).toBe(200);
    expect(res.body.answeredFields).toEqual([
      'dailyMinutes',
      'housingType',
      'outdoor',
      'pets',
      'rooms',
    ]);
    // Значение при этом обновилось: список не мешает обычному PUT.
    expect(res.body.profile.outdoor).toBe('yard');
  });

  itWithData('GET отдаёт тот же список, что и PUT', async (data) => {
    const res = await getProfile(data.token);

    expect(res.status).toBe(200);
    expect(res.body.answeredFields).toEqual([
      'dailyMinutes',
      'housingType',
      'outdoor',
      'pets',
      'rooms',
    ]);
  });
});

describe.skipIf(!fixture)('PUT /api/home-profile: завершение и сброс', () => {
  itWithData('полный проход с complete: true отмечает анкету и собирает все поля', async (data) => {
    const res = await putProfile(data.token, { ...FULL_ANSWERS, complete: true });

    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(res.body.profile.completedAt).toBeTruthy();
    expect(res.body.answeredFields).toEqual(ALL_FIELDS);
  });

  itWithData('DELETE очищает список вместе с профилем', async (data) => {
    const res = await request(app).delete('/api/home-profile').set(auth(data.token));

    expect(res.status).toBe(200);
    expect(res.body.profileReset).toBe(true);
    expect(res.body.profile).toBeNull();
    expect(res.body.completed).toBe(false);
    expect(res.body.answeredFields).toEqual([]);
  });

  itWithData('после сброса GET снова отдаёт пустой список', async (data) => {
    const res = await getProfile(data.token);

    expect(res.status).toBe(200);
    expect(res.body.profile).toBeNull();
    expect(res.body.answeredFields).toEqual([]);
  });
});

describe.skipIf(!fixture)('PUT /api/home-profile: мусор не попадает в прогресс', () => {
  itWithData('пустое тело отвечает 400 и ничего не записывает', async (data) => {
    const rejected = await putProfile(data.token, {});

    expect(rejected.status).toBe(400);

    const res = await getProfile(data.token);

    expect(res.status).toBe(200);
    expect(res.body.answeredFields).toEqual([]);
  });

  itWithData('неизвестное поле не считается ответом', async (data) => {
    const rejected = await putProfile(data.token, { favouriteRoom: 'kitchen' });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe('Нужно передать хотя бы одно поле анкеты');

    const res = await getProfile(data.token);

    expect(res.status).toBe(200);
    expect(res.body.profile).toBeNull();
    expect(res.body.answeredFields).toEqual([]);
  });

  itWithData('недопустимое значение поля не попадает в список', async (data) => {
    const rejected = await putProfile(data.token, { housingType: 'castle' });

    expect(rejected.status).toBe(400);

    const res = await getProfile(data.token);

    expect(res.status).toBe(200);
    expect(res.body.answeredFields).toEqual([]);
  });

  itWithData('чужое имя в колонке не превращается в пройденный шаг', async (data) => {
    // Такую строку обычным PUT не создать: сервер принимает только известные
    // поля. Но колонку может задеть старый клиент или ручная правка, а по этим
    // именам интерфейс считает шаги — мусор наружу не отдаём.
    await pool.query('INSERT INTO home_profiles (user_id, answered_fields) VALUES ($1, $2::text[])', [
      data.userId,
      ['housingType', 'favouriteRoom'],
    ]);

    const res = await getProfile(data.token);

    expect(res.status).toBe(200);
    expect(res.body.answeredFields).toEqual(['housingType']);

    await pool.query('DELETE FROM home_profiles WHERE user_id = $1', [data.userId]);
  });
});
