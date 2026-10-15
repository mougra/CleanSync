import { extraKeys, missingKeys } from '../../services/translations';

/**
 * Достижения на английском.
 *
 * Ключ — `achievements.code` из сида (`backend/seed.ts`): он стабилен, в отличие
 * от названия, и по нему же достижение ищется в базе. Сид проверяет полноту
 * (`validateAchievementTranslations`) и падает, если для достижения нет перевода
 * или перевод остался от удалённого достижения: молча показать русское название
 * в английском интерфейсе хуже, чем не собрать справочник.
 */
export const ACHIEVEMENT_EN: Record<string, { name: string; description: string }> = {
  // ── Задачи ──────────────────────────────────────────────────────────────
  first_step: { name: 'First step', description: 'Complete your first cleaning task' },
  getting_started: { name: 'Getting started', description: 'Complete 5 tasks' },
  dedicated: { name: 'Persistence', description: 'Complete 10 cleaning tasks' },
  quarter_century: { name: 'Twenty-five', description: 'Complete 25 tasks' },
  pro_cleaner: { name: 'Professional', description: 'Complete 50 cleaning tasks' },
  centurion: { name: 'One hundred', description: 'Complete 100 tasks' },

  // ── Челленджи ───────────────────────────────────────────────────────────
  challenge_started: {
    name: 'Challenge lover',
    description: 'Start your first challenge',
  },
  challenge_three: { name: 'Three challenges', description: 'Start three challenges' },
  challenge_finished: {
    name: 'Finisher',
    description: 'Complete a challenge from start to finish',
  },
  challenge_finished_three: {
    name: 'Marathoner',
    description: 'Complete three challenges',
  },
  day_complete: {
    name: 'Checklist complete',
    description: 'Finish every task of a single day',
  },
  week_of_days: { name: 'A whole week', description: 'Close seven challenge days' },

  // ── Привычки ────────────────────────────────────────────────────────────
  habit_added: { name: 'First habit', description: 'Add a habit from the catalog' },
  habit_three: { name: 'Three habits', description: 'Keep three habits at the same time' },
  habit_five: { name: 'Five habits', description: 'Keep five habits at the same time' },
  custom_habit: { name: 'Habit of your own', description: 'Create a habit from scratch' },
  custom_habit_three: {
    name: 'Habit author',
    description: 'Create three habits of your own',
  },
  habit_first_check: { name: 'Checked!', description: 'Check off a habit for the first time' },
  habit_check_ten: { name: 'Ten check-ins', description: 'Check off your habits ten times' },
  habit_check_fifty: {
    name: 'Fifty check-ins',
    description: 'Check off your habits fifty times',
  },
  habit_streak_three: {
    name: 'Three days in a row',
    description: 'Keep a habit for three days straight',
  },
  habit_streak_week: {
    name: 'A week without gaps',
    description: 'Keep a habit for seven days straight',
  },
  habit_streak_month: {
    name: 'A month of habit',
    description: 'Keep a habit for thirty days straight',
  },
  habit_variety: {
    name: 'Well-rounded',
    description: 'Keep habits from three categories',
  },
  habit_variety_five: { name: 'Five areas', description: 'Keep habits from five categories' },
};

/** Проверка полноты перевода: используется сидом перед записью в базу. */
export const validateAchievementTranslations = (codes: readonly string[]): string[] => {
  const problems: string[] = [];

  for (const code of missingKeys(codes, ACHIEVEMENT_EN)) {
    problems.push(`нет английского перевода достижения «${code}»`);
  }

  for (const code of extraKeys(codes, ACHIEVEMENT_EN)) {
    problems.push(`английский перевод достижения «${code}» остался без оригинала`);
  }

  return problems;
};
