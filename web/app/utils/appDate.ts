/**
 * Календарный день приложения на клиенте.
 *
 * «Сегодня» на экране обязано совпадать с тем, что считает сервер: он живёт по
 * поясу приложения (`APP_TIME_ZONE`, по умолчанию Москва), а не по UTC и не по
 * поясу браузера. Иначе после местной полуночи человек увидит вчерашний день как
 * сегодняшний и не сможет отметить задачу, либо отметка уйдёт на чужую дату.
 *
 * Пояс приходит из `runtimeConfig.public.appTimeZone`.
 */
export const appToday = (timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
