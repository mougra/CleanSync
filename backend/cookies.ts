import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Авторизация на httpOnly-cookie.
 *
 * Схема: access-токен в httpOnly-cookie (15 минут, весь сайт), refresh-токен
 * в httpOnly-cookie (7 дней, только /api/auth), плюс CSRF-токен в обычной cookie
 * (double-submit: значение cookie должно совпасть с заголовком X-CSRF-Token).
 *
 * Для этого приложение и API должны быть на одном origin — иначе браузер
 * не отправит cookie (см. docs/PLAN.md §12.2).
 */

const isProduction = process.env.NODE_ENV === 'production';

export const ACCESS_COOKIE = 'cp_access';
export const REFRESH_COOKIE = 'cp_refresh';
export const CSRF_COOKIE = 'cp_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

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
  // refresh-токен доступен только маршрутам авторизации — меньше поверхность атаки.
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...httpOnlyBase,
    path: '/api/auth',
    maxAge: SEVEN_DAYS,
  });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(ACCESS_COOKIE, { ...httpOnlyBase, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...httpOnlyBase, path: '/api/auth' });
};

/** CSRF-токен намеренно НЕ httpOnly: клиент читает его и повторяет в заголовке. */
export const issueCsrfToken = (res: Response): string => {
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SEVEN_DAYS,
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
