/**
 * Границы и шаг счётчика периодичности в «своих задачах».
 *
 * Одна единица измерения — **день**: именно её хранит `interval_count` задачи
 * (миграция 0022), поэтому «раз в 3 недели» это 21, а «раз в 3 месяца» — 90.
 * Пределы повторяют проверку API (`backend/routes/tasks.ts`): снизу сутки, сверху
 * 3650 дней (десять лет). Ниже границы смысла нет, выше — это уже не
 * периодичность, а недоразумение.
 *
 * Шаг счётчика — единица выбранной шкалы: у дней это день, у недель неделя, у
 * месяцев месяц. Так «+» в месячной шкале не превращает «раз в 3 месяца» в «раз в
 * 3 месяца и 1 день», а счётчик показывает ровное число.
 */
import type { TaskRepeatUnit } from '~/types/task';

/** Верхняя граница интервала: 3650 дней — как в API. */
export const MAX_INTERVAL_DAYS = 3650;

/** Шкала повтора → сколько дней в её единице. */
export const DAYS_PER_REPEAT_UNIT: Record<Exclude<TaskRepeatUnit, 'once'>, number> = {
  day: 1,
  week: 7,
  month: 30,
};

/**
 * Ступени счётчика по шкалам.
 *
 * Это лестницы генератора (backend/services/defaultTasks.ts: DAY_RUNGS и
 * WEEKLY_RUNGS), выписанные в днях: в неделях это 1/2/3/6 недель, в месяцах —
 * 1/2/3/4/6/12 месяцев. Ступени принадлежат шкале, поэтому счётчик и ходит по
 * своей лестнице: в недельной не бывает 4 и 5 недель, а в месячной — 5 и 7
 * месяцев. Иначе в задаче появлялись бы интервалы, которых нет в каталоге и
 * которые не с чем сравнить.
 */
const LADDER_BY_UNIT: Record<Exclude<TaskRepeatUnit, 'once'>, readonly number[]> = {
  day: [1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90, 120, 180, 360, 3650],
  week: [7, 14, 21, 42],
  month: [30, 60, 90, 120, 180, 360, 1800, 3650],
};

/**
 * Приводит интервал в днях к границам и к ступеням выбранной шкалы.
 *
 * Экспортируется: этим же правилом пользуются лист создания задачи и лист правки —
 * второй конвертации «дни ↔ шкала» в интерфейсе быть не должно.
 */
export const clampIntervalDays = (days: number, unit: TaskRepeatUnit): number => {
  if (unit === 'once') return 1;

  const ladder = LADDER_BY_UNIT[unit];
  const clamped = Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)));

  if (ladder.includes(clamped)) return clamped;

  // Ближайшая ступень лестницы: при равном расстоянии — более редкая, потому что
  // «+» и «−» должны быть предсказуемы, а не прыгать через ступень.
  return ladder.reduce((best, rung) =>
    Math.abs(rung - clamped) < Math.abs(best - clamped) ? rung : best
  );
};

/**
 * Следующая или предыдущая ступень в днях.
 *
 * На границе лестницы возвращается текущая ступень: счётчик не должен уходить за
 * то, что понимает выборка «Сегодня».
 */
export const stepIntervalDays = (
  days: number,
  unit: TaskRepeatUnit,
  delta: number
): number => {
  if (unit === 'once') return 1;

  const ladder = LADDER_BY_UNIT[unit];
  const current = clampIntervalDays(days, unit);
  const index = ladder.indexOf(current);
  const next = index + (delta > 0 ? 1 : -1);

  return ladder[Math.min(ladder.length - 1, Math.max(0, next))] ?? current;
};

/** Счётчик для показа человеку: 7 дней в недельной шкале — это «1». */
export const intervalCountForUnit = (days: number, unit: TaskRepeatUnit): number =>
  unit === 'once' ? 1 : Math.max(1, Math.round(days / DAYS_PER_REPEAT_UNIT[unit]));

/**
 * Единица шкалы для интервала в днях: по ней задача открывается в форме правки.
 *
 * Частота задачи уже говорит, в какой шкале человек её завёл: `weekly` — недели,
 * `monthly` — месяцы, `daily` — дни. Раскладывать «раз в 21 день» по дням не
 * нужно: 21 кратно неделе, и в недельной шкале это читается как «3».
 */
export const unitForIntervalDays = (frequency: string | null): TaskRepeatUnit =>
  frequency === 'weekly' ? 'week' : frequency === 'monthly' ? 'month' : frequency === 'daily' ? 'day' : 'once';
