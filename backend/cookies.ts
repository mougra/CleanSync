import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Авторизация на httpOnly-cookie.
 *
 * Схема: access-токен в httpOnly-cookie (15 минут), refresh-токен в httpOnly-cookie
 * (30 дней), плюс CSRF-токен в обычной cookie (double-submit: значение cookie
 * должно совпасть с заголовком X-CSRF-Token). Обе сессионные cookie живут на всём
 * сайте (`path=/`).
 *
 * Почему refresh не спрятан под `/api/auth`, как было раньше: серверному рендеру
 * (Nuxt) нужно видеть refresh-токен, чтобы восстановить сессию, когда access уже
 * истёк. Браузер отдаёт cookie только тем путям, на которые она выдана, и на
 * запрос страницы `/` cookie с путём `/api/auth` не приходит — плагин
 * `restore-session` не видел её вовсе и страница всегда рисовалась гостем после
 * 15 минут. HttpOnly и SameSite=Lax остаются, а прочитать токен из JS по-прежнему
 * нельзя; ограничение по пути защитой от XSS не является (скрипт того же origin
 * и так не читает httpOnly-cookie).
 *
 * Для этого приложение и API должны быть на одном origin — иначе браузер
 * не отправит cookie.
 */

const isProduction = process.env.NODE_ENV === 'production';

export const ACCESS_COOKIE = 'cp_access';
export const REFRESH_COOKIE = 'cp_refresh';
export const CSRF_COOKIE = 'cp_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Путь, на котором жила refresh-cookie до перехода на `path=/`.
 *
 * Cookie с другим путём — отдельная cookie с тем же именем. Её нужно явно
 * удалять, иначе после обновления у человека в браузере останутся две живые
 * cookie: старая (путь `/api/auth`) и новая (`/`), и сервер будет читать ту,
 * которую браузер прислал последней.
 */
const LEGACY_REFRESH_PATH = '/api/auth';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
/**
 * Срок жизни refresh-cookie — 30 дней, как и у самого токена (`REFRESH_TOKEN_EXPIRY`).
 *
 * Числа обязаны совпадать: если cookie живёт меньше токена, браузер выбросит её
 * раньше, чем истечёт подпись, и человек выйдет из аккаунта без причины.
 */
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

const httpOnlyBase = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
} as const;

export const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string }
): void => {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...httpOnlyBase,
    path: '/',
    maxAge: FIFTEEN_MINUTES,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...httpOnlyBase,
    path: '/',
    maxAge: THIRTY_DAYS,
  });
  // Убираем cookie, выданную прежней версией (путь `/api/auth`).
  res.clearCookie(REFRESH_COOKIE, { ...httpOnlyBase, path: LEGACY_REFRESH_PATH });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(ACCESS_COOKIE, { ...httpOnlyBase, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...httpOnlyBase, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...httpOnlyBase, path: LEGACY_REFRESH_PATH });
};

/** CSRF-токен намеренно НЕ httpOnly: клиент читает его и повторяет в заголовке. */
export const issueCsrfToken = (res: Response): string => {
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    // CSRF живёт столько же, сколько refresh-сессия: иначе он истекал бы
    // посреди работы, и первый же изменяющий запрос получал бы 403.
    maxAge: THIRTY_DAYS,
  });
  return token;
};

/**
 * Возвращает уже выданный CSRF-токен или создаёт новый.
 * Токен должен быть стабильным в рамках сессии: если менять его при логине,
 * клиент отправит устаревшее значение и получит 403.
 */
export const ensureCsrfToken = (req: Request, res: Response): string => {
  const existing = req.cookies?.[CSRF_COOKIE];
  if (typeof existing === 'string' && existing) {
    return existing;
  }
  return issueCsrfToken(res);
};

export const readAccessToken = (req: Request): string | null => {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie) {
    return fromCookie;
  }
  const header = req.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
};

export const readRefreshToken = (req: Request): string | null => {
  const fromCookie = req.cookies?.[REFRESH_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie) {
    return fromCookie;
  }
  const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return typeof fromBody === 'string' && fromBody ? fromBody : null;
};

const safeEqual = (a: string, b: string): boolean => {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie. Запросы без cookie пропускаем: их браузер не может
 * подделать автоматически (Bearer-клиенты, curl), а значит CSRF им не грозит.
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (!req.headers.cookie) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (
    typeof cookieToken !== 'string' ||
    typeof headerToken !== 'string' ||
    !safeEqual(cookieToken, headerToken)
  ) {
    res.status(403).json({ error: 'CSRF token missing or invalid' });
    return;
  }

  next();
};
