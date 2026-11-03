import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  ensureCsrfToken,
  setAuthCookies,
} from '../cookies';

interface CookieCall {
  name: string;
  value: string;
  path: string | undefined;
  maxAge: number | undefined;
}

/** Заглушка ответа: записывает, какие cookie API ставит и какие чистит. */
const fakeResponse = () => {
  const set: CookieCall[] = [];
  const cleared: CookieCall[] = [];

  const response = {
    cookie(name: string, value: string, options?: { path?: string; maxAge?: number }) {
      set.push({ name, value, path: options?.path, maxAge: options?.maxAge });
      return response;
    },
    clearCookie(name: string, options?: { path?: string }) {
      cleared.push({ name, value: '', path: options?.path, maxAge: undefined });
      return response;
    },
  };

  return { response: response as unknown as Response, set, cleared };
};

/** Заглушка запроса: сервер читает из неё уже выданные cookie. */
const fakeRequest = (cookies: Record<string, string>) =>
  ({ cookies }) as unknown as Request;

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

describe('сессионные cookie', () => {
  it('refresh-cookie ставится на весь сайт — иначе серверный рендер её не увидит', () => {
    const { response, set } = fakeResponse();

    setAuthCookies(response, { accessToken: 'access', refreshToken: 'refresh' });

    const refresh = set.find((item) => item.name === REFRESH_COOKIE);

    expect(refresh?.value).toBe('refresh');
    // Cookie с путём /api/auth браузер не присылает на запрос страницы `/`,
    // и серверный плагин восстановления сессии не может её прочитать.
    expect(refresh?.path).toBe('/');
    expect(set.find((item) => item.name === ACCESS_COOKIE)?.path).toBe('/');
  });

  it('cookie прежней версии с путём /api/auth удаляется при входе и обновлении', () => {
    const { response, cleared } = fakeResponse();

    setAuthCookies(response, { accessToken: 'access', refreshToken: 'refresh' });

    expect(cleared).toEqual([{ name: REFRESH_COOKIE, value: '', path: '/api/auth', maxAge: undefined }]);
  });

  it('выход чистит refresh-cookie на обоих путях', () => {
    const { response, cleared } = fakeResponse();

    clearAuthCookies(response);

    expect(cleared.filter((item) => item.name === REFRESH_COOKIE).map((item) => item.path)).toEqual([
      '/',
      '/api/auth',
    ]);
  });
});

describe('CSRF-cookie', () => {
  it('значение не перевыпускается, но срок жизни продлевается при каждом обновлении сессии', () => {
    const { response, set } = fakeResponse();

    const token = ensureCsrfToken(fakeRequest({ [CSRF_COOKIE]: 'issued-token' }), response);

    // Менять значение нельзя: клиент отправит устаревший заголовок и получит 403.
    expect(token).toBe('issued-token');

    const csrf = set.find((item) => item.name === CSRF_COOKIE);

    // А срок обязан ехать вместе с сессией: иначе активный человек через 30 дней
    // получал 403 на любом изменяющем запросе при живой сессии.
    expect(csrf?.value).toBe('issued-token');
    expect(csrf?.maxAge).toBe(THIRTY_DAYS);
    expect(csrf?.path).toBe('/');
  });

  it('без cookie выпускает новый токен', () => {
    const { response, set } = fakeResponse();

    const token = ensureCsrfToken(fakeRequest({}), response);

    expect(token).toMatch(/^[a-f0-9]{48}$/);
    expect(set.find((item) => item.name === CSRF_COOKIE)?.value).toBe(token);
  });
});
