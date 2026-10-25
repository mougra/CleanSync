/**
 * Cookie со смещением пояса устройства.
 *
 * Нужна серверному рендеру: без неё первый кадр считает день по поясу сервера, и
 * у человека в другом поясе календарь мелькает чужим днём, пока не поднимется
 * приложение. Кука обновляется на каждом заходе, потому что смещение меняется с
 * переходом на летнее время и с поездками.
 *
 * Значение — минуты на восток от UTC (`600` для Владивостока). Срок год, `lax`:
 * читать её будет только наш же сервер, и она не секрет.
 */
import { TIMEZONE_COOKIE } from '~/utils/deviceDay';

export default defineNuxtPlugin(() => {
  const offset = -new Date().getTimezoneOffset();
  const current = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${TIMEZONE_COOKIE}=`))
    ?.slice(TIMEZONE_COOKIE.length + 1);

  if (current === String(offset)) {
    return;
  }

  document.cookie = `${TIMEZONE_COOKIE}=${offset}; path=/; max-age=31536000; samesite=lax`;
});
