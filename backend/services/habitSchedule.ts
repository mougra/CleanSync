/**
 * Расписание привычек: когда привычка «актуальна» и какая у неё серия.
 * Вынесено из роутов, потому что этим пользуется и планировщик напоминаний.
 */

export const INTERVAL_UNITS = new Set(['once', 'day', 'week', 'month']);

/** Локальная дата пользователя: важна именно она, а не UTC. */
export const todayIso = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);

/** Период повторения в днях; для «один раз» возвращаем null. */
export const intervalDays = (count: number, unit: string): number | null => {
  if (unit === 'once') {
    return null;
  }
  if (unit === 'week') {
    return Math.max(1, count) * 7;
  }
  if (unit === 'month') {
    return Math.max(1, count) * 30;
  }
  return Math.max(1, count);
};

/** Серия подряд идущих дней, заканчивающаяся сегодня или вчера. */
export const currentStreak = (dates: string[], today: string): number => {
  const unique = [...new Set(dates)].sort().reverse();
  if (unique.length === 0) {
    return 0;
  }

  const gapToToday = daysBetween(unique[0]!, today);
  if (gapToToday > 1) {
    return 0;
  }

  let streak = 1;
  for (let index = 1; index < unique.length; index += 1) {
    if (daysBetween(unique[index]!, unique[index - 1]!) === 1) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
};

export interface HabitSchedule {
  interval_count: number;
  interval_unit: string;
  due_date: string | null;
  created_at: string;
  completions: string[];
}

/** Актуальна ли привычка сегодня: с учётом периода и последней отметки. */
export const isHabitDue = (habit: HabitSchedule, today: string): boolean => {
  const completions = habit.completions ?? [];
  const lastCompletedOn = completions[0] ?? null;
  const period = intervalDays(habit.interval_count, habit.interval_unit);

  if (period === null) {
    return completions.length === 0;
  }

  if (lastCompletedOn) {
    return daysBetween(lastCompletedOn, today) >= period;
  }

  // Новая привычка актуальна сразу, но не раньше своей даты начала.
  return !habit.due_date || habit.due_date <= today;
};
