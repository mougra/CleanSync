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

/**
 * Смещение пояса устройства в минутах на восток от UTC.
 *
 * Зачем не IANA-зона. Для двух задач нужны разные вещи: «какой сегодня день у
 * человека» (это клиент уже присылает готовой датой) и «в каком поясе трактовать
 * момент отметки» (для серии). Второе — это ровно смещение, а не имя зоны, и
 * смещение не надо разбирать с таблицей переходов: клиент присылает его сам
 * (`-new Date().getTimezoneOffset()`).
 *
 * Клиент кладёт смещение ещё и в cookie: серверный рендер иначе не знает, какой
 * день рисовать в календаре, и до гидратации показывал день пояса приложения.
 *
 * Значение проверяем и ограничиваем ±14 часами: в запросе может прийти мусор, а
 * подставляется оно в SQL (умножением на `interval '1 minute'`, но диапазон всё
 * равно обязан быть разумным).
 */
export const MINUTES_IN_DAY = 24 * 60;

export const offsetMinutes = (value: unknown): number => {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(typeof raw === 'string' ? raw.trim() : `${raw ?? ''}`, 10);

  if (!Number.isFinite(parsed) || Math.abs(parsed) > 14 * 60) {
    return appZoneOffsetMinutes();
  }

  return parsed;
};

/** Смещение пояса приложения (Москвы по умолчанию) в минутах на восток. */
export function appZoneOffsetMinutes(moment: Date = new Date()): number {
  const utc = new Date(moment.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(moment.toLocaleString('en-US', { timeZone: APP_TIME_ZONE }));

  return Math.round((local.getTime() - utc.getTime()) / 60_000);
}

/**
 * День, который видит человек с таким смещением: `2026-10-25`.
 *
 * Считаем прямо в JS: момент плюс смещение — это настенное время устройства,
 * и `toISOString` на сдвинутой дате отдаёт именно его.
 */
export const dayWithOffset = (minutes: number, moment: Date = new Date()): string =>
  new Date(moment.getTime() + minutes * 60_000).toISOString().slice(0, 10);

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

/**
 * День, который человек считает сегодняшним, по данным запроса.
 *
 * Зачем это поверх `appToday()`. Пояс приложения (Москва) — догадка: у человека
 * в другом поясе календарь рисует дату из его устройства, а сервер считал день
 * по Москве, и после местной полуночи список задач отвечал «завтра» — ровно та
 * жалоба, из-за которой появился этот помощник. Клиент присылает свой день
 * заголовком `X-Client-Date`, сервер доверяет ему, потому что речь о том, что
 * человек видит у себя в календаре.
 *
 * Заголовок необязательный: без него (старый клиент, curl, фоновая задача)
 * остаётся день приложения, то есть прежнее поведение.
 */
export const clientToday = (header: unknown): string =>
  optionalClientDay(header) ?? appToday();

/** Явный день из заголовка или `null`, если его нет/он битый. */
export const optionalClientDay = (header: unknown): string | null => {
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = typeof value === 'string' ? value.trim() : '';

  return parseAppDay(trimmed) ? trimmed : null;
};

/**
 * Часы запроса: день человека и смещение его пояса.
 *
 * Одна сущность на все дневные решения, чтобы «сегодня» и «в каком поясе считать
 * момент» не разъехались: серия, отметки и экран обязаны жить в одном дне.
 * Порядок источников прежний — явный день в заголовке, затем смещение, затем
 * день приложения.
 */
export interface RequestClock {
  /** Сегодняшний день человека: `YYYY-MM-DD`. */
  today: string;
  /** Смещение его пояса на восток от UTC, в минутах. */
  offsetMinutes: number;
}

export const requestClock = (
  dayHeader: unknown,
  offsetHeader: unknown,
  moment: Date = new Date(),
): RequestClock => {
  const minutes = offsetMinutes(offsetHeader);

  return {
    today: optionalClientDay(dayHeader) ?? dayWithOffset(minutes, moment),
    offsetMinutes: minutes,
  };
};
