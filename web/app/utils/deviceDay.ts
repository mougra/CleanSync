/**
 * День устройства и смещение его пояса.
 *
 * Зачем это отдельно от `appTimeZone`. Приложение долго жило по поясу сервера
 * (Москва), а календарь рисует дату браузера: после местной полуночи у человека в
 * другом поясе календарь показывал сегодняшний день, а план подписывался
 * «завтра». Теперь источник дня — устройство, а сервер узнаёт о нём из заголовка
 * `X-Client-Offset` (смещение в минутах на восток) и из cookie, которую ставит
 * `plugins/timezone.client.ts`.
 *
 * Cookie нужна только серверному рендеру: без неё первый кадр рисовал день
 * сервера, и у пользователя в другом поясе день мелькал чужим до гидратации.
 */

export const TIMEZONE_COOKIE = 'tidyplan-tz-offset';

/** Смещение из cookie: минуты на восток от UTC. `null` — cookie нет или она битая. */
export const offsetFromCookie = (raw: string | undefined | null): number | null => {
  if (!raw) {
    return null;
  }

  for (const part of raw.split(';')) {
    const [key, ...rest] = part.split('=');

    if (key?.trim() !== TIMEZONE_COOKIE) {
      continue;
    }

    const value = Number.parseInt(rest.join('=').trim(), 10);

    return Number.isFinite(value) && Math.abs(value) <= 14 * 60 ? value : null;
  }

  return null;
};

/**
 * Смещение пояса по имени зоны на сейчас: `180` для Москвы.
 *
 * Нужно как запасной вариант на сервере, когда cookie ещё нет: пояс приложения
 * живёт в runtimeConfig, а смещение считается из него — так первый кадр совпадает
 * с тем, что ответил бы API без заголовков (он падает на пояс приложения, а не на
 * UTC сервера).
 */
export const zoneOffsetMinutes = (zone: string, moment: Date = new Date()): number => {
  const utc = new Date(moment.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(moment.toLocaleString('en-US', { timeZone: zone }));

  return Math.round((local.getTime() - utc.getTime()) / 60_000);
};

/**
 * Календарный день для пояса со смещением `minutes`: `2026-10-25`.
 *
 * Момент сдвигаем на смещение и берём дату из UTC-представления — это и есть
 * настенное время устройства.
 */
export const dayWithOffset = (minutes: number, moment: Date = new Date()): string =>
  new Date(moment.getTime() + minutes * 60_000).toISOString().slice(0, 10);
