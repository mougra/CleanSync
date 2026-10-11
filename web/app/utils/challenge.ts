import type { ChallengeDay, ChallengeProgress, ChallengeSeason } from '~/types/challenge';

/**
 * Сезон по дате. Месяцы разложены по сезонам так же, как на сервере
 * (`routes/challenges.ts`): декабрь–февраль зима, март–май весна и так далее.
 *
 * Нужен только запасному пути, когда `GET /api/challenges/current` недоступен.
 */
export function seasonForDate(date: Date): ChallengeSeason {
  const month = date.getMonth();

  if (month === 11 || month <= 1) {
    return 'winter';
  }

  if (month <= 4) {
    return 'spring';
  }

  if (month <= 7) {
    return 'summer';
  }

  return 'autumn';
}

/**
 * Сумма по дням челленджа: тот же расчёт, что делает сервер в `summarize`.
 *
 * Нужна для оптимистичной отметки: галочка и счётчик должны меняться сразу,
 * до ответа сети, а после ответа значения приходят уже с сервера.
 */
export function summarizeChallengeDays(days: ChallengeDay[]): ChallengeProgress {
  let done = 0;
  let total = 0;
  let minutesLeft = 0;
  let currentDay: number | null = null;

  for (const day of days) {
    for (const task of day.tasks) {
      total += 1;

      if (task.is_done) {
        done += 1;
      } else {
        minutesLeft += task.estimated_minutes;
        currentDay ??= day.day_number;
      }
    }
  }

  return {
    done,
    total,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    minutesLeft,
    currentDay,
  };
}
