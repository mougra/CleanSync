import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../cookies';

interface CookieCall {
  name: string;
  value: string;
  path: string | undefined;
}

/** Заглушка ответа: записывает, какие cookie API ставит и какие чистит. */
const fakeResponse = () => {
  const set: CookieCall[] = [];
  const cleared: CookieCall[] = [];

  const response = {
    cookie(name: string, value: string, options?: { path?: string }) {
      set.push({ name, value, path: options?.path });
      return response;
    },
    clearCookie(name: string, options?: { path?: string }) {
      cleared.push({ name, value: '', path: options?.path });
      return response;
    },
  };

  return { response: response as unknown as Response, set, cleared };
};

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

    expect(cleared).toEqual([{ name: REFRESH_COOKIE, value: '', path: '/api/auth' }]);
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
