/**
 * Файл календаря из плана уборки.
 *
 * Зачем .ics, а не push о каждой задаче. Нативная подписка на календарь —
 * единственный способ, которым телефон напоминает **при закрытом приложении**
 * и без сервера: iOS и Android показывают уведомление по `VALARM` сами, а само
 * событие повторяется по `RRULE` годами. Web Push для задач потребовал бы
 * хранить время напоминания на сервере и слать его по расписанию — это отдельная
 * инфраструктура, а календарь уже есть у каждого.
 *
 * Формат собираем руками: зависимость ради тридцати строк `VCALENDAR` не нужна,
 * а правила в нём простые (RFC 5545).
 *
 * Что попадает в файл:
 *  - недельные дела (раз в 1, 2, 3 или 6 недель) — повтор по дню недели;
 *  - месячные и реже — повтор по числу месяца с шагом в месяцах;
 *  - длительность события — минуты задачи, будильник — за 15 минут.
 *
 * Что не попадает: ежедневная рутина. Каталог от неё избавлен, а если дело всё
 * же пришло, событие «каждый день» только зашумит календарь.
 */

export interface CalendarTask {
  title: string;
  minutes: number;
  cadence: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  intervalCount: number;
}

/** Дни недели: 0 — воскресенье, как в `tasks.day_of_week` и в анкете. */
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Недельные шкалы: у них опора — день недели, а не число месяца. */
const WEEKLY_CADENCES = new Set(['weekly', 'biweekly', 'threeWeeks', 'sixWeeks']);

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Время события — «плавающее» (без `Z`): календарь читает его как местное время
 * устройства. Так «в 10:00» остаётся 10:00 и в Москве, и в другом часовом
 * поясе, куда человек переехал. С `Z` событие показывалось бы в UTC, и
 * напоминание о уборке приезжало бы на несколько часов раньше или позже.
 */
const localStamp = (date: Date): string =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;

/**
 * `DTSTAMP` по RFC 5545 — всегда UTC: это момент, когда файл собран, а не когда
 * начнётся дело.
 */
const utcStamp = (date: Date): string =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;

/** Строка `RRULE` для задачи; `null` — если дело не повторяется по правилам. */
const recurrence = (task: CalendarTask): string | null => {
  const interval = Math.max(1, task.intervalCount);

  if (WEEKLY_CADENCES.has(task.cadence)) {
    const day = task.dayOfWeek === null ? 1 : task.dayOfWeek;

    return `FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${BYDAY[day]}`;
  }

  if (task.dayOfMonth !== null) {
    return `FREQ=MONTHLY;INTERVAL=${interval};BYMONTHDAY=${task.dayOfMonth}`;
  }

  return null;
};

/**
 * Экранирование текста по RFC 5545: обратный слэш, точка с запятой, запятая и
 * перевод строки. Без этого название с запятой («Матрас, подушки, постель»)
 * ломает разбор файла, и календарь молча не открывает событие.
 */
const escapeText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/**
 * Складывание длинных строк (75 октетов, RFC 5545). Считаем **байты**, а не
 * символы: кириллица в UTF-8 занимает два байта, и по символам строка
 * «протереть рабочие поверхности на кухне» не выглядит длинной, хотя в октетах
 * давно перевалила за предел. Без этого часть клиентов обрезает `SUMMARY`.
 */
const fold = (line: string): string => {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;

  for (const character of line) {
    const size = encoder.encode(character).length;

    // 73, а не 75: один октет оставляем на пробел продолжения строки.
    if (bytes + size > 73 && current.length > 0) {
      parts.push(current);
      current = '';
      bytes = 0;
    }

    current += character;
    bytes += size;
  }

  parts.push(current);

  return parts.join('\r\n ');
};

/** Ближайший день недели не раньше сегодняшнего: событие не начинается в прошлом. */
const nextWeekday = (from: Date, dayOfWeek: number): Date => {
  const date = new Date(from);
  const delta = (dayOfWeek - date.getDay() + 7) % 7;

  date.setDate(date.getDate() + delta);
  date.setHours(10, 0, 0, 0);

  return date;
};

/** Ближайшее число месяца: если оно уже прошло, берём следующий месяц. */
const nextMonthDay = (from: Date, dayOfMonth: number): Date => {
  const date = new Date(from);
  const day = Math.min(dayOfMonth, 28);

  date.setHours(10, 0, 0, 0);

  if (date.getDate() > day) {
    date.setMonth(date.getMonth() + 1, 1);
  }

  date.setDate(day);

  return date;
};

/** Устойчивый идентификатор события: он не должен меняться между экспортами. */
const uidFor = (task: CalendarTask): string => {
  let hash = 0;

  for (const character of `${task.title}|${task.cadence}`) {
    hash = (hash * 31 + character.charCodeAt(0)) % 0xffffffff;
  }

  return `tidyplan-${hash.toString(16)}@tidyplan.ru`;
};

export interface CalendarOptions {
  /** Название календаря в списке календарей телефона. */
  name: string;
  /** Момент экспорта: от него считаются первые даты. */
  now?: Date;
}

export const buildPlanCalendar = (
  tasks: readonly CalendarTask[],
  options: CalendarOptions,
): string => {
  const now = options.now ?? new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TidyPlan//Cleaning plan//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.name)}`,
  ];

  for (const task of tasks) {
    const rule = recurrence(task);

    if (!rule) continue;

    const weekly = WEEKLY_CADENCES.has(task.cadence);

    const start = weekly
      ? nextWeekday(now, task.dayOfWeek ?? 1)
      : nextMonthDay(now, task.dayOfMonth ?? 1);

    const end = new Date(start.getTime() + Math.max(5, task.minutes) * 60 * 1000);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidFor(task)}`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${localStamp(start)}`,
      `DTEND:${localStamp(end)}`,
      `RRULE:${rule}`,
      `SUMMARY:${escapeText(task.title)}`,
      `DESCRIPTION:${escapeText('TidyPlan · ' + task.minutes + ' мин')}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(task.title)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  return lines.map(fold).join('\r\n');
};

/**
 * Скачивание файла. Отдельная функция, чтобы страница не знала про `Blob` и
 * `URL.createObjectURL`, а тесты могли проверить только сборку текста.
 */
export const downloadCalendar = (content: string, filename: string): void => {
  if (!import.meta.client) return;

  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.rel = 'noopener';

  document.body.append(link);
  link.click();
  link.remove();

  // Ссылку освобождаем сразу после клика: иначе Blob висит в памяти вкладки.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
