import pool from '../db';

/**
 * Начисление достижений.
 *
 * Считаем метрики пользователя одним запросом, затем выдаём всё, что ещё
 * не получено и чей порог уже пройден. Тип критерия и порог лежат в таблице
 * achievements, поэтому новую ачивку достаточно добавить в сид — код менять
 * не нужно, если метрика уже считается.
 */

export interface Metrics {
  total_completed: number;
  challenges_started: number;
  challenges_finished: number;
  challenge_days_done: number;
  habits_added: number;
  custom_habits: number;
  habit_checkins: number;
  habit_streak: number;
  habit_categories: number;
}

/** Максимальная серия подряд идущих дней по отметкам одной привычки. */
const longestStreak = (dates: string[]): number => {
  if (dates.length === 0) {
    return 0;
  }

  const unique = [...new Set(dates)].sort().reverse();
  let best = 1;
  let current = 1;

  for (let index = 1; index < unique.length; index += 1) {
    const previous = new Date(unique[index - 1]!);
    const next = new Date(unique[index]!);
    const diffDays = Math.round((previous.getTime() - next.getTime()) / 86_400_000);

    if (diffDays === 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
};

export const collectMetrics = async (userId: string): Promise<Metrics> => {
  const totals = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM tasks t
          JOIN schedules s ON t.schedule_id = s.id
         WHERE s.user_id = $1 AND t.is_completed = TRUE) AS own_tasks,
       (SELECT COUNT(*) FROM user_task_progress p
          JOIN user_challenges uc ON uc.id = p.user_challenge_id
         WHERE uc.user_id = $1 AND p.is_done = TRUE) AS challenge_tasks,
       -- «Начал» — это незакрытый челлендж: completed означает уже пройденный,
       -- и в метрику старта он не входит (иначе «Три испытания» выдавалось бы
       -- дважды за один и тот же челлендж).
       (SELECT COUNT(*) FROM user_challenges WHERE user_id = $1 AND status = 'active') AS challenges_started,
       -- 'finished' — прежнее название завершения: оставлен для совместимости,
       -- чтобы достижения не пропали у тех, кто закрыл челлендж до миграции 0013.
       (SELECT COUNT(*) FROM user_challenges
         WHERE user_id = $1 AND status IN ('completed', 'finished')) AS challenges_finished,
       (SELECT COUNT(*) FROM user_habits WHERE user_id = $1 AND archived_at IS NULL) AS habits_added,
       (SELECT COUNT(*) FROM user_habits
         WHERE user_id = $1 AND template_id IS NULL AND archived_at IS NULL) AS custom_habits,
       (SELECT COUNT(*) FROM habit_completions c
          JOIN user_habits h ON h.id = c.user_habit_id
         WHERE h.user_id = $1) AS habit_checkins,
       (SELECT COUNT(DISTINCT ht.category)
          FROM user_habits h
          JOIN habit_templates ht ON ht.id = h.template_id
         WHERE h.user_id = $1 AND h.archived_at IS NULL) AS habit_categories`,
    [userId]
  );

  // Дни челленджей, где отмечены все задачи.
  const daysDone = await pool.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT d.id
         FROM challenge_days d
         JOIN challenge_tasks t ON t.challenge_day_id = d.id
         JOIN user_challenges uc ON uc.challenge_id = d.challenge_id AND uc.user_id = $1
         LEFT JOIN user_task_progress p
                ON p.challenge_task_id = t.id AND p.user_challenge_id = uc.id
        GROUP BY d.id
       HAVING COUNT(*) > 0 AND COUNT(*) = COUNT(*) FILTER (WHERE p.is_done)
     ) AS completed_days`,
    [userId]
  );

  const completions = await pool.query(
    `SELECT c.user_habit_id, c.completed_on::text AS completed_on
       FROM habit_completions c
       JOIN user_habits h ON h.id = c.user_habit_id
      WHERE h.user_id = $1
      ORDER BY c.user_habit_id`,
    [userId]
  );

  const byHabit = new Map<number, string[]>();
  for (const row of completions.rows) {
    const list = byHabit.get(row.user_habit_id) ?? [];
    list.push(row.completed_on);
    byHabit.set(row.user_habit_id, list);
  }

  const habitStreak = Math.max(
    0,
    ...[...byHabit.values()].map((dates) => longestStreak(dates))
  );

  const row = totals.rows[0];

  return {
    total_completed: Number(row.own_tasks) + Number(row.challenge_tasks),
    challenges_started: Number(row.challenges_started),
    challenges_finished: Number(row.challenges_finished),
    challenge_days_done: Number(daysDone.rows[0]?.total ?? 0),
    habits_added: Number(row.habits_added),
    custom_habits: Number(row.custom_habits),
    habit_checkins: Number(row.habit_checkins),
    habit_streak: habitStreak,
    habit_categories: Number(row.habit_categories),
  };
};

/** Проверяет критерии и выдаёт новые достижения. Возвращает их коды. */
export const checkAndAwardAchievements = async (userId: string): Promise<string[]> => {
  try {
    const metrics = await collectMetrics(userId);

    const candidates = await pool.query<{
      id: number;
      code: string;
      criteria_type: keyof Metrics;
      criteria_value: number;
    }>(
      `SELECT a.id, a.code, a.criteria_type, a.criteria_value
         FROM achievements a
        WHERE NOT EXISTS (
          SELECT 1 FROM user_achievements ua
           WHERE ua.user_id = $1 AND ua.achievement_id = a.id
        )`,
      [userId]
    );

    const awarded: string[] = [];

    for (const achievement of candidates.rows) {
      const current = metrics[achievement.criteria_type];

      if (typeof current !== 'number' || current < achievement.criteria_value) {
        continue;
      }

      await pool.query(
        `INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2)
         ON CONFLICT (user_id, achievement_id) DO NOTHING`,
        [userId, achievement.id]
      );
      awarded.push(achievement.code);
    }

    return awarded;
  } catch (err) {
    console.error('Error checking achievements:', err);
    return [];
  }
};

/** Сколько всего достижений и сколько уже получено — для блока на главной. */
export const getAchievementProgress = async (
  userId: string
): Promise<{ total: number; earned: number }> => {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM achievements) AS total,
       (SELECT COUNT(*) FROM user_achievements WHERE user_id = $1) AS earned`,
    [userId]
  );

  return {
    total: Number(result.rows[0]?.total ?? 0),
    earned: Number(result.rows[0]?.earned ?? 0),
  };
};
