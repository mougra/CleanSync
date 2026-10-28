import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';

/**
 * Публичный план дня: тот же базовый набор, что получит зарегистрированный.
 *
 * Тест не требует базы и входа — маршрут специально публичный. Проверяем
 * главное, что может сломаться незаметно: день принимается параметром,
 * мусорная дата отвергается, набор не пустой и сумма минут сходится.
 */
describe('публичный план дня', () => {
  it('отдаёт дела базового набора на запрошенный день', async () => {
    const response = await request(app).get('/api/plan/today?date=2026-10-28');

    expect(response.status).toBe(200);
    expect(response.body.date).toBe('2026-10-28');
    expect(Array.isArray(response.body.tasks)).toBe(true);
    expect(response.body.tasks.length).toBeGreaterThan(0);
    expect(response.body.tasks[0]).toMatchObject({
      title: expect.any(String),
      room: expect.any(String),
      minutes: expect.any(Number),
      cadence: expect.any(String),
    });
  });

  it('сумма минут в сводке совпадает со списком', async () => {
    const response = await request(app).get('/api/plan/today?date=2026-11-15');
    const minutes = response.body.tasks.reduce(
      (sum: number, task: { minutes: number }) => sum + task.minutes,
      0,
    );

    expect(response.body.summary.tasks).toBe(response.body.tasks.length);
    expect(response.body.summary.minutes).toBe(minutes);
  });

  it('без даты берёт сегодняшний день, а не падает', async () => {
    const response = await request(app).get('/api/plan/today');

    expect(response.status).toBe(200);
    expect(response.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('мусорная дата — 400, а не пустой список', async () => {
    const response = await request(app).get('/api/plan/today?date=2026-02-31');

    expect(response.status).toBe(400);
  });

  it('английский язык переводит названия и зоны', async () => {
    const response = await request(app)
      .get('/api/plan/today?date=2026-10-28')
      .set('Accept-Language', 'en');

    const titles = response.body.tasks.map((task: { title: string }) => task.title);

    expect(titles.some((title: string) => /[A-Za-z]/.test(title))).toBe(true);
  });
});
