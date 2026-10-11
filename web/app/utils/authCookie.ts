/**
 * Подменяет `cp_access` в строке cookie, остальные пары сохраняет.
 *
 * Нужно из-за порядка разбора токена на сервере: он берёт cookie раньше заголовка
 * Authorization, поэтому в SSR недостаточно послать свежий токен заголовком —
 * старый access в проброшенной cookie всё равно победит.
 */
export const mergeAccessCookie = (cookie: string, token: string): string =>
  [
    ...cookie
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith('cp_access=')),
    `cp_access=${token}`,
  ].join('; ');
