import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db';

afterAll(async () => {
  await pool.end();
});

describe('HTTP-слой', () => {
  it('GET /api/health отвечает и сообщает состояние базы', async () => {
    const res = await request(app).get('/api/health');

    // 503 — база недоступна; тест не должен падать только из-за отсутствия PostgreSQL.
    expect([200, 503]).toContain(res.status);
    expect(res.body.status).toBe('Backend is running');
    expect(['up', 'down']).toContain(res.body.database);
  });

  it('неизвестный маршрут отдаёт 404', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
  });

  it('защищённый маршрут без токена отдаёт 401', async () => {
    const res = await request(app).get('/api/schedules');

    expect(res.status).toBe(401);
  });

  it('защищённый маршрут с мусорным токеном отдаёт 401', async () => {
    const res = await request(app).get('/api/schedules').set('Authorization', 'Bearer not-a-jwt');

    expect(res.status).toBe(401);
  });
});
