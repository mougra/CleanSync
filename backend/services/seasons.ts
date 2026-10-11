/**
 * Сезон челленджа по текущей дате.
 *
 * В `challenges.season` лежат ровно четыре значения: spring / summer / autumn /
 * winter. Они же используются как ключ для челленджа текущего сезона
 * (`GET /api/challenges/current`) и при наполнении сида
 * (`backend/seed-challenges.ts`), поэтому имена сезонов живут в одном месте.
 *
 * Границы — календарные месяцы:
 *   весна  — март, апрель, май          (3–5)
 *   лето   — июнь, июль, август         (6–8)
 *   осень  — сентябрь, октябрь, ноябрь  (9–11)
 *   зима   — декабрь, январь, февраль   (12, 1, 2)
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export const isSeason = (value: unknown): value is Season =>
  typeof value === 'string' && (SEASONS as string[]).includes(value);

/**
 * Сезон по дате. Месяц берём локальный: пользователь смотрит на свой календарь,
 * а не на UTC-время сервера.
 */
export const seasonForDate = (date: Date = new Date()): Season => {
  const month = date.getMonth() + 1;

  if (month >= 3 && month <= 5) {
    return 'spring';
  }

  if (month >= 6 && month <= 8) {
    return 'summer';
  }

  if (month >= 9 && month <= 11) {
    return 'autumn';
  }

  return 'winter';
};

/** Русское название сезона — для сообщений об ошибках и логов. */
export const seasonTitle = (season: Season): string =>
  ({
    spring: 'весна',
    summer: 'лето',
    autumn: 'осень',
    winter: 'зима',
  })[season];
