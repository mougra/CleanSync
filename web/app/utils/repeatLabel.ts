/**
 * Подпись периодичности задачи: пара «частота + интервал» → то, что видит человек.
 *
 * Зачем отдельный модуль. `interval_count` хранится в **днях** (миграция 0022):
 * «раз в 3 недели» — это 21, «раз в 3 месяца» — 90. Экран «Сегодня» раньше
 * подставлял это число прямо в подпись, и «Почистить духовку» (90 дней)
 * показывалась как «раз в 90 месяцев». Правило перевода в единицы — одно на всё
 * приложение, поэтому оно живёт здесь, а не в разметке страницы.
 *
 * Особые случаи названы словами, а не числом: 42 дня — «раз в полтора месяца»
 * (решение заказчика), 180 — «раз в полгода», 360 — «раз в год». Остальное
 * считается: если интервал делится на неделю/месяц, показываем единицу шкалы,
 * иначе — честные дни.
 */
import type { TaskFrequency } from '~/types/checklist';

/** Единица шкалы в подписи: день — когда интервал не делится ровно. */
export type RepeatLabelUnit = 'day' | 'week' | 'month';

/** Готовые фразы, под которые в словаре есть ключи `plan.*`. */
export type RepeatPhraseKey =
  | 'repeatDay'
  | 'repeatWeek'
  | 'repeatMonth'
  | 'repeatMonthAndHalf'
  | 'repeatHalfYear'
  | 'repeatYear';

export type RepeatLabel =
  | { kind: 'none' }
  | { kind: 'once' }
  | { kind: 'phrase'; key: RepeatPhraseKey }
  | { kind: 'count'; count: number; unit: RepeatLabelUnit };

const DAYS_IN_WEEK = 7;
const DAYS_IN_MONTH = 30;

/**
 * Подпись повторения задачи.
 *
 * `none` — частота не задана (разовая задача без повтора); `once` — «один раз»;
 * `phrase` — готовая фраза из словаря; `count` — «раз в N дней/недель/месяцев».
 */
export const repeatLabel = (
  frequency: TaskFrequency | string | null | undefined,
  intervalCount: number | null | undefined,
): RepeatLabel => {
  if (!frequency) {
    return { kind: 'none' };
  }

  if (frequency === 'once') {
    return { kind: 'once' };
  }

  const days = Math.max(1, Math.round(intervalCount ?? 1));

  if (frequency === 'daily') {
    return days <= 1
      ? { kind: 'phrase', key: 'repeatDay' }
      : { kind: 'count', count: days, unit: 'day' };
  }

  if (frequency === 'weekly') {
    if (days === DAYS_IN_WEEK) return { kind: 'phrase', key: 'repeatWeek' };
    if (days === 42) return { kind: 'phrase', key: 'repeatMonthAndHalf' };
    if (days % DAYS_IN_WEEK === 0) {
      return { kind: 'count', count: days / DAYS_IN_WEEK, unit: 'week' };
    }

    return { kind: 'count', count: days, unit: 'day' };
  }

  // Месячная частота: всё остальное — месяцы или честные дни.
  if (days === DAYS_IN_MONTH) return { kind: 'phrase', key: 'repeatMonth' };
  if (days === 180) return { kind: 'phrase', key: 'repeatHalfYear' };
  if (days === 360) return { kind: 'phrase', key: 'repeatYear' };
  if (days % DAYS_IN_MONTH === 0) {
    return { kind: 'count', count: days / DAYS_IN_MONTH, unit: 'month' };
  }

  return { kind: 'count', count: days, unit: 'day' };
};
