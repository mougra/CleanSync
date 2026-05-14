<template>
  <div class="achievements-page">
    <div class="header">
      <h2>🏆 Достижения</h2>
      <p>Отслеживайте свой прогресс в поддержании чистоты</p>
    </div>

    <div class="stats-section">
      <div class="stat-card">
        <div class="stat-number">{{ userStats.tasks_completed }}</div>
        <div class="stat-label">Задач выполнено</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ userStats.achievements_unlocked }}</div>
        <div class="stat-label">Достижений получено</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ userStats.max_streak }}</div>
        <div class="stat-label">Максимальная серия (дни)</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ totalPoints }}</div>
        <div class="stat-label">Очков заработано</div>
      </div>
    </div>

    <div class="achievements-grid">
      <div
        v-for="achievement in achievements"
        :key="achievement.id"
        :class="['achievement-card', achievement.unlocked ? 'unlocked' : 'locked']"
      >
        <div class="achievement-icon">
          {{ achievement.unlocked ? achievement.icon : '🔒' }}
        </div>
        <div class="achievement-content">
          <h3>{{ achievement.title }}</h3>
          <p>{{ achievement.description }}</p>
          <div class="achievement-meta">
            <span class="category">{{ getCategoryName(achievement.category) }}</span>
            <span class="points">{{ achievement.points }} очков</span>
          </div>
          <div v-if="achievement.unlocked" class="unlocked-date">
            Разблокировано: {{ formatDate(achievement.unlocked_at) }}
          </div>
          <div v-else class="progress">
            Прогресс: {{ getProgressText(achievement) }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="newlyUnlocked.length > 0" class="notification">
      <div class="notification-content">
        <h3>🎉 Новые достижения!</h3>
        <ul>
          <li v-for="achievement in newlyUnlocked" :key="achievement">
            {{ getAchievementTitle(achievement) }}
          </li>
        </ul>
        <button @click="clearNotifications" class="btn-close">Закрыть</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AchievementsPage',
  data() {
    return {
      achievements: [],
      userStats: {
        tasks_completed: 0,
        achievements_unlocked: 0,
        max_streak: 0
      },
      newlyUnlocked: [],
      loading: true,
      error: null
    };
  },
  computed: {
    totalPoints() {
      return this.achievements
        .filter(a => a.unlocked)
        .reduce((sum, a) => sum + a.points, 0);
    }
  },
  mounted() {
    this.loadAchievements();
  },
  methods: {
    async loadAchievements() {
      try {
        const response = await fetch('http://localhost:5000/api/achievements', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to load achievements');
        }

        this.achievements = await response.json();

        // Calculate user stats
        this.userStats.achievements_unlocked = this.achievements.filter(a => a.unlocked).length;

        // Check for new achievements
        await this.checkAchievements();

      } catch (err) {
        this.error = 'Не удалось загрузить достижения';
        console.error(err);
      } finally {
        this.loading = false;
      }
    },

    async checkAchievements() {
      try {
        const response = await fetch('http://localhost:5000/api/achievements/check', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          this.userStats = { ...this.userStats, ...data.stats };

          if (data.unlocked && data.unlocked.length > 0) {
            this.newlyUnlocked = data.unlocked;
            // Reload achievements to show new unlocked ones
            await this.loadAchievements();
          }
        }
      } catch (err) {
        console.error('Failed to check achievements:', err);
      }
    },

    getCategoryName(category) {
      const categories = {
        'beginner': 'Начинающий',
        'intermediate': 'Продвинутый',
        'advanced': 'Мастер',
        'special': 'Особое'
      };
      return categories[category] || category;
    },

    getProgressText(achievement) {
      // This is a simplified progress calculation
      // In a real app, you'd track progress more accurately
      const progressMap = {
        'tasks_completed': `${Math.min(this.userStats.tasks_completed, achievement.condition_value)}/${achievement.condition_value}`,
        'streak_days': `${Math.min(this.userStats.max_streak, achievement.condition_value)}/${achievement.condition_value}`,
        'checklists_completed': 'В разработке',
        'all_achievements': `${this.userStats.achievements_unlocked}/26`,
        'perfect_week': 'В разработке'
      };
      return progressMap[achievement.condition_type] || 'В разработке';
    },

    formatDate(dateString) {
      if (!dateString) return '';
      return new Date(dateString).toLocaleDateString('ru-RU');
    },

    getAchievementTitle(key) {
      const achievement = this.achievements.find(a => a.key === key);
      return achievement ? achievement.title : key;
    },

    clearNotifications() {
      this.newlyUnlocked = [];
    }
  }
};
</script>

<style scoped>
.achievements-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h2 {
  font-size: 2.5rem;
  margin-bottom: 10px;
}

.header p {
  color: #666;
  font-size: 1.1rem;
}

.stats-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  border: 2px solid #e9ecef;
}

.stat-number {
  font-size: 2rem;
  font-weight: bold;
  color: #26d07c;
  margin-bottom: 8px;
}

.stat-label {
  color: #6c757d;
  font-size: 0.9rem;
}

.achievements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.achievement-card {
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  transition: all 0.3s ease;
}

.achievement-card.locked {
  background: #f8f9fa;
  border: 2px solid #dee2e6;
  opacity: 0.6;
}

.achievement-card.unlocked {
  background: linear-gradient(135deg, #26d07c, #20c997);
  border: 2px solid #26d07c;
  color: white;
}

.achievement-icon {
  font-size: 2.5rem;
  flex-shrink: 0;
}

.achievement-content {
  flex: 1;
}

.achievement-content h3 {
  margin: 0 0 8px 0;
  font-size: 1.2rem;
}

.achievement-content p {
  margin: 0 0 12px 0;
  font-size: 0.95rem;
  opacity: 0.9;
}

.achievement-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.category {
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
}

.points {
  font-size: 0.9rem;
  font-weight: 500;
}

.unlocked-date,
.progress {
  font-size: 0.85rem;
  opacity: 0.8;
}

.notification {
  position: fixed;
  top: 20px;
  right: 20px;
  background: #26d07c;
  color: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  max-width: 400px;
}

.notification-content h3 {
  margin: 0 0 12px 0;
}

.notification ul {
  margin: 0 0 16px 0;
  padding-left: 20px;
}

.btn-close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

@media (max-width: 768px) {
  .achievements-grid {
    grid-template-columns: 1fr;
  }

  .stats-section {
    grid-template-columns: repeat(2, 1fr);
  }

  .header h2 {
    font-size: 2rem;
  }
}
</style>