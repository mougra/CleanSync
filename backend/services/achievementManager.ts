import pool from '../db';

export const checkAndAwardAchievements = async (userId: string) => {
  try {
    // 1. Get total completed tasks for this user
    const result = await pool.query(
      `SELECT COUNT(*) as total FROM tasks
       JOIN schedules ON tasks.schedule_id = schedules.id
       WHERE schedules.user_id = $1 AND tasks.is_completed = TRUE`,
      [userId]
    );
    const totalCompleted = parseInt(result.rows[0].total);

    // 2. Find achievements the user hasn't earned yet but meets criteria for
    const pendingAchievements = await pool.query(
      `SELECT a.id, a.code, a.criteria_value
       FROM achievements a
       WHERE a.criteria_type = 'total_completed'
       AND a.criteria_value <= $1
       AND NOT EXISTS (
         SELECT 1 FROM user_achievements ua
         WHERE ua.user_id = $2 AND ua.achievement_id = a.id
       )`,
      [totalCompleted, userId]
    );

    // 3. Award achievements
    const awarded = [];
    for (const achievement of pendingAchievements.rows) {
      await pool.query(
        `INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2)`,
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
