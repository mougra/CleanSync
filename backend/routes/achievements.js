import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../auth.js';

const router = express.Router();

// Get all achievements with user's unlock status
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.key,
        a.title,
        a.description,
        a.icon,
        a.category,
        a.condition_type,
        a.condition_value,
        a.points,
        CASE WHEN ua.user_id IS NOT NULL THEN true ELSE false END as unlocked,
        ua.unlocked_at
      FROM achievements a
      LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
      ORDER BY a.id
    `, [req.userId]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Check and unlock achievements for user
router.post('/check', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    // Get user's stats
    const statsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM tasks t
         JOIN schedules s ON t.schedule_id = s.id
         WHERE s.user_id = $1 AND t.is_completed = true) as tasks_completed,
        (SELECT COUNT(*) FROM user_achievements WHERE user_id = $1) as achievements_unlocked,
        (SELECT MAX(streak_days) FROM (
          SELECT COUNT(*) as streak_days
          FROM (
            SELECT DATE(created_at) as date, COUNT(*) as completed_tasks
            FROM tasks t
            JOIN schedules s ON t.schedule_id = s.id
            WHERE s.user_id = $1 AND t.is_completed = true
            GROUP BY DATE(created_at)
            HAVING COUNT(*) > 0
            ORDER BY DATE(created_at) DESC
          ) daily_stats
          GROUP BY date
          ORDER BY date DESC
        ) streaks) as max_streak
    `, [userId]);

    const stats = statsResult.rows[0];
    const tasksCompleted = parseInt(stats.tasks_completed) || 0;
    const achievementsUnlocked = parseInt(stats.achievements_unlocked) || 0;
    const maxStreak = parseInt(stats.max_streak) || 0;

    // Get achievements that user doesn't have yet
    const achievementsResult = await pool.query(`
      SELECT id, key, condition_type, condition_value
      FROM achievements a
      WHERE NOT EXISTS (
        SELECT 1 FROM user_achievements ua
        WHERE ua.achievement_id = a.id AND ua.user_id = $1
      )
    `, [userId]);

    const unlockedAchievements = [];

    for (const achievement of achievementsResult.rows) {
      let shouldUnlock = false;

      switch (achievement.condition_type) {
        case 'tasks_completed':
          shouldUnlock = tasksCompleted >= achievement.condition_value;
          break;
        case 'streak_days':
          shouldUnlock = maxStreak >= achievement.condition_value;
          break;
        case 'checklists_completed':
          // For now, we'll assume checklists are completed when user has schedules
          // This can be enhanced later with proper checklist tracking
          const checklistsResult = await pool.query(`
            SELECT COUNT(*) as checklists_completed
            FROM schedules WHERE user_id = $1
          `, [userId]);
          shouldUnlock = parseInt(checklistsResult.rows[0].checklists_completed) >= achievement.condition_value;
          break;
        case 'all_achievements':
          shouldUnlock = achievementsUnlocked >= 26; // All other achievements
          break;
        case 'perfect_week':
          // Check if user completed all tasks in any week
          const perfectWeekResult = await pool.query(`
            SELECT COUNT(*) > 0 as has_perfect_week
            FROM (
              SELECT DATE_TRUNC('week', created_at) as week,
                     COUNT(*) as total_tasks,
                     COUNT(CASE WHEN is_completed THEN 1 END) as completed_tasks
              FROM tasks t
              JOIN schedules s ON t.schedule_id = s.id
              WHERE s.user_id = $1
              GROUP BY DATE_TRUNC('week', created_at)
              HAVING COUNT(*) = COUNT(CASE WHEN is_completed THEN 1 END)
            ) weekly_stats
          `, [userId]);
          shouldUnlock = perfectWeekResult.rows[0].has_perfect_week;
          break;
      }

      if (shouldUnlock) {
        // Unlock achievement
        await pool.query(`
          INSERT INTO user_achievements (user_id, achievement_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, achievement_id) DO NOTHING
        `, [userId, achievement.id]);

        unlockedAchievements.push(achievement.key);
      }
    }

    res.json({
      unlocked: unlockedAchievements,
      stats: {
        tasks_completed: tasksCompleted,
        max_streak: maxStreak,
        achievements_unlocked: achievementsUnlocked + unlockedAchievements.length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check achievements' });
  }
});

export default router;