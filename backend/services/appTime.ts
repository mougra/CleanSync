/**
 * Границы дня приложения.
 *
 * «Сегодня» — это не UTC и не время сервера, а календарный день в поясе
 * приложения. Иначе после местной полуночи человек видит вчерашний план как
 * сегодняшний, а отметка уходит на чужую дату: у проекта русскоязычная
 * аудитория, поэтому по умолчанию взят пояс Москвы, а переопределяется он
 * переменной `APP_TIME_ZONE`.
 *
 * Дальше по коду календарный день ходит строкой `YYYY-MM-DD` и при разборе
 * превращается в UTC-полночь: так день недели и число месяца считаются из самой
 * даты и не зависят ни от пояса сервера, ни от летнего времени.
 */

/** Пояс приложения: им определяются границы дня в плане, отметках и статистике. */
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE?.trim() || 'Europe/Moscow';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Календарный день момента в поясе приложения: `2026-10-13`. */
export const appDay = (moment: Date = new Date()): string => formatter.format(moment);

/** Сегодняшний календарный день приложения. */
export const appToday = (): string => appDay(new Date());

/**
 * SQL-выражение «сегодня» для запросов, где дата нужна внутри PostgreSQL
 * (`CURRENT_DATE` берёт пояс сервера и потому расходится с приложением).
 *
 * Пояс приходит из переменной окружения, поэтому имя проверяем на допустимые
 * символы, а не подставляем в запрос как есть.
 */
export const SQL_APP_TODAY = (() => {
  if (!/^[A-Za-z0-9_+\-/]+$/.test(APP_TIME_ZONE)) {
    throw new Error(`APP_TIME_ZONE содержит недопустимые символы: ${APP_TIME_ZONE}`);
  }

  return `(now() AT TIME ZONE '${APP_TIME_ZONE}')::date`;
})();

/** Разбор календарного дня в UTC-полночь. Некорректная дата — `null`. */
export const parseAppDay = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return date;
};
