<template>
  <div class="achievements-page">
    <h1>Достижения</h1>
    <div class="achievements-grid">
      <div
        v-for="achievement in allAchievements"
        :key="achievement.id"
        class="achievement-card"
        :class="{ unlocked: isUnlocked(achievement.id) }"
      >
        <div class="icon-container">
          <i :class="achievement.icon || 'pi pi-lock'"></i>
        </div>
        <div class="achievement-info">
          <span class="name">{{ achievement.name }}</span>
          <span class="description">{{ achievement.description }}</span>
          <span v-if="getEarnedDate(achievement.id)" class="earned-date">
            Получено: {{ getEarnedDate(achievement.id) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const allAchievements = ref<any[]>([]);
const userAchievements = ref<any[]>([]);

async function fetchAchievements() {
  try {
    const token = authStore.token;

    // Fetch all available achievements
    const allRes = await axios.get('http://localhost:5000/api/achievements');
    allAchievements.value = allRes.data;

    // Fetch achievements earned by the user
    const userRes = await axios.get('http://localhost:5000/api/achievements/user', {
      headers: { Authorization: `Bearer ${token}` }
    });
    userAchievements.value = userRes.data;
  } catch (err) {
    console.error('Failed to fetch achievements:', err);
  }
}

function isUnlocked(id: number) {
  return userAchievements.value.some(a => a.id === id);
}

function getEarnedDate(id: number) {
  const earned = userAchievements.value.find(a => a.id === id);
  return earned ? new Date(earned.earned_at).toLocaleDateString('ru-RU') : null;
}

onMounted(fetchAchievements);
</script>

<style scoped>
.achievements-page {
  padding: 2rem;
  max-width: 1000px;
  margin: 0 auto;
}

h1 {
  margin-bottom: 2rem;
  text-align: center;
  color: var(--text-color);
}

.achievements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1.5rem;
}

.achievement-card {
  background: #f1f5f9;
  padding: 1.5rem;
  border-radius: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: all 0.3s ease;
  opacity: 0.6;
  filter: grayscale(1);
  border: 2px solid transparent;
}

.achievement-card.unlocked {
  background: white;
  opacity: 1;
  filter: grayscale(0);
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  border-color: #3B82F6;
  transform: translateY(-2px);
}

.icon-container {
  font-size: 2rem;
  color: #94a3b8;
}

.achievement-card.unlocked .icon-container {
  color: #3B82F6;
}

.achievement-info {
  display: flex;
  flex-direction: column;
}

.achievement-info .name {
  font-weight: bold;
  font-size: 1.1rem;
  color: #1e293b;
}

.achievement-info .description {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0.25rem 0;
}

.achievement-info .earned-date {
  font-size: 0.75rem;
  color: #3B82F6;
  font-weight: 500;
}
</style>
