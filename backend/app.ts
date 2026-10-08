import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import schedulesRoutes from './routes/schedules';
import tasksRoutes from './routes/tasks';
import achievementsRoutes from './routes/achievements';
import analyticsRoutes from './routes/analytics';
import templatesRoutes from './routes/templates';
import pool from './db';
import { csrfProtection } from './cookies';

/**
 * Express-приложение без запуска сервера: так его можно импортировать в тестах
 * (supertest) и не поднимать порт. Точка входа — server.ts.
 *
 * Схему БД здесь больше никто не меняет: за неё отвечают миграции
 * (backend/migrations) и сид (backend/seed.ts).
 */
const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// CSRF проверяем до маршрутов: защищает все изменяющие запросы, которые
// браузер выполняет с cookie (см. backend/cookies.ts).
app.use('/api', csrfProtection);

app.get('/api/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'Backend is running', database: 'up' });
  } catch {
    res.status(503).json({ status: 'Backend is running', database: 'down' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/schedules', schedulesRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/templates', templatesRoutes);

export default app;
