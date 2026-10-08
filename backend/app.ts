import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import authRoutes from './routes/auth';
import schedulesRoutes from './routes/schedules';
import tasksRoutes from './routes/tasks';
import achievementsRoutes from './routes/achievements';
import analyticsRoutes from './routes/analytics';
import templatesRoutes from './routes/templates';
import challengesRoutes from './routes/challenges';
import habitsRoutes from './routes/habits';
import checklistsRoutes from './routes/checklists';
import pushRoutes from './routes/push';
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

/**
 * За обратным прокси (Nitro devProxy локально, Caddy в проде) реальный IP
 * приходит в X-Forwarded-For. Без доверия к прокси rate-limit считал бы все
 * запросы одним клиентом и ругался на неожиданный заголовок.
 */
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV !== 'production') {
  app.set('trust proxy', 1);
}

/**
 * Заголовки безопасности. CSP выключен: этот сервис отдаёт только JSON,
 * а HTML и статику отдаёт Nuxt — политику безопасности правильнее задавать
 * на нём, иначе легко случайно сломать загрузку фронтенда.
 */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

/**
 * CORS: приложение и API живут на одном origin (иначе httpOnly-cookie
 * не отправится), поэтому по умолчанию кросс-доменные запросы запрещены.
 * Список разрешённых источников задаётся переменной CORS_ORIGINS.
 */
const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

/** Общий предохранитель от перебора и флуда по всему API. */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_API ?? 600),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

/**
 * Жёсткий лимит на аутентификацию: подбор пароля и рассылка писем
 * не должны быть дешёвыми для атакующего.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_AUTH ?? 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts, please try again later' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth/resend-confirmation', authLimiter);

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
app.use('/api/challenges', challengesRoutes);
app.use('/api/habits', habitsRoutes);
app.use('/api/checklists', checklistsRoutes);
app.use('/api/push', pushRoutes);

export default app;
