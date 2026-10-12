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
 * Пояс приложения в виде SQL-литерала.
 *
 * Пояс приходит из переменной окружения, поэтому имя проверяем на допустимые
 * символы, а не подставляем в запрос как есть.
 */
const APP_TIME_ZONE_SQL = (() => {
  if (!/^[A-Za-z0-9_+\-/]+$/.test(APP_TIME_ZONE)) {
    throw new Error(`APP_TIME_ZONE содержит недопустимые символы: ${APP_TIME_ZONE}`);
  }

  return `'${APP_TIME_ZONE}'`;
})();

/**
 * SQL-выражение «сегодня» для запросов, где дата нужна внутри PostgreSQL
 * (`CURRENT_DATE` берёт пояс сервера и потому расходится с приложением).
 */
export const SQL_APP_TODAY = `(now() AT TIME ZONE ${APP_TIME_ZONE_SQL})::date`;

/**
 * Календарный день колонки-момента времени — то же «сегодня», но для отметки:
 * `sqlAppDate('c.completed_at')`.
 *
 * Колонки-моменты проекта объявлены как `timestamp without time zone`
 * (`tasks.completed_at`, `user_task_progress.done_at`,
 * `task_completions.completed_at`), а пишет в них Postgres из сессии с поясом
 * UTC: момент лежит в UTC. Поэтому перевод в пояс приложения идёт в два шага —
 * сначала значение трактуется как UTC, затем сдвигается в пояс приложения
 * (`AT TIME ZONE` на `timestamp` возвращает `timestamptz`, второй `AT TIME ZONE`
 * снова отдаёт настенное время нужного пояса).
 *
 * Для колонок `timestamptz` первый шаг не нужен — сервер уже знает момент, и
 * хватит `column AT TIME ZONE '…'`; таких колонок в схеме пока нет. Колонки-даты
 * (`task_completions.completed_on`, `habit_completions.completed_on`,
 * `streak_freezes.covered_on`) конвертировать не нужно: это уже день.
 */
export const sqlAppDate = (column: string): string =>
  `((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TIME_ZONE_SQL})::date`;

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
