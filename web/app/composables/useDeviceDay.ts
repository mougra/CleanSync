/**
 * Часы устройства: смещение пояса и сегодняшний день по ним.
 *
 * На клиенте смещение знает сам браузер. На сервере его знает только cookie,
 * которую ставит `plugins/timezone.client.ts`: без неё серверный рендер рисовал
 * день пояса сервера, и у человека в другом поясе календарь на первом кадре
 * показывал чужой день.
 *
 * Запасной вариант на сервере — пояс приложения из `runtimeConfig`, а не UTC:
 * иначе первый заход без cookie показывал бы один день, а API с тем же запросом
 * отвечал бы про другой.
 *
 * Cookie читается в момент вызова, а не при создании: повторный заход уже с
 * cookie должен рисоваться правильно с первого кадра.
 */
import { TIMEZONE_COOKIE, offsetFromCookie, zoneOffsetMinutes } from '~/utils/deviceDay';

export const useDeviceOffset = (): number => {
  if (import.meta.client) {
    // `getTimezoneOffset` отдаёт минуты на запад; нам нужны на восток.
    return -new Date().getTimezoneOffset();
  }

  const fromCookie = offsetFromCookie(useRequestHeaders(['cookie']).cookie);

  if (fromCookie !== null) {
    return fromCookie;
  }

  return zoneOffsetMinutes(String(useRuntimeConfig().public.appTimeZone));
};

/** Имя cookie для клиентского плагина: одно место, один ключ. */
export const timezoneCookieName = TIMEZONE_COOKIE;
