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

/** Смещение пояса устройства на момент `moment`: минуты на восток от UTC. */
export const deviceOffsetMinutes = (moment: Date = new Date()): number =>
  -moment.getTimezoneOffset();

/**
 * Сколько осталось до ближайшей местной полуночи (плюс секунда запаса).
 *
 * Нужно таймеру смены дня: он ставится ровно на границу суток по часам
 * устройства, а не опрашивает время раз в минуту. Секунда запаса — чтобы
 * сработавший таймер гарантированно оказался уже в новом дне.
 */
export const msUntilLocalMidnight = (moment: Date = new Date()): number => {
  const next = new Date(moment.getFullYear(), moment.getMonth(), moment.getDate() + 1, 0, 0, 1);

  return Math.max(0, next.getTime() - moment.getTime());
};

/**
 * Записать смещение пояса в cookie для серверного рендера.
 *
 * Cookie читает `useDeviceOffset()` на сервере: без неё первый кадр считается по
 * поясу приложения. Значение обновляется при заходе и при смене пояса (переход
 * на летнее время, поездка) — иначе после смены пояса сервер ещё год рисовал бы
 * старый день.
 */
export const saveTimezoneOffset = (minutes: number): void => {
  if (typeof document === 'undefined') {
    return;
  }

  // То же значение уже стоит — не трогаем cookie: плагин пояса зовётся на каждом
  // заходе, и лишняя запись в хранилище на каждой странице не нужна.
  if (offsetFromCookie(document.cookie) === minutes) {
    return;
  }

  document.cookie = `${TIMEZONE_COOKIE}=${minutes}; path=/; max-age=31536000; samesite=lax`;
};

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
