<template>
  <div class="analytics-page">
    <h1>Статистика уборки</h1>
    <div class="chart-container">
      <Chart
        type="line"
        :data="chartData"
        :options="chartOptions"
        class="p-chart"
      />
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <span class="label">Всего завершено</span>
        <span class="value">{{ totalCompleted }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import Chart from 'primevue/chart';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const analyticsData = ref<any[]>([]);
const totalCompleted = ref(0);

const chartData = computed(() => {
  const labels = analyticsData.value.map(d => new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
  const counts = analyticsData.value.map(d => d.count);

  return {
    labels,
    datasets: [
      {
        label: 'Завершенные задачи',
        data: counts,
        fill: true,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#3B82F6'
      }
    ]
  };
});

const chartOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        stepSize: 1
      }
    }
  }
});

async function fetchAnalytics() {
  try {
    const token = authStore.token;
    const response = await axios.get('http://localhost:5000/api/analytics/tasks', {
      headers: { Authorization: `Bearer ${token}` }
    });
    analyticsData.value = response.data;
    totalCompleted.value = analyticsData.value.reduce((acc, curr) => acc + curr.count, 0);
  } catch (err) {
    console.error('Failed to fetch analytics:', err);
  }
}

onMounted(fetchAnalytics);
</script>

<style scoped>
.analytics-page {
  padding: 2rem;
  max-width: 1000px;
  margin: 0 auto;
}

h1 {
  margin-bottom: 2rem;
  text-align: center;
  color: var(--text-color);
}

.chart-container {
  background: white;
  padding: 2rem;
  border-radius: 1rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  margin-bottom: 2rem;
  height: 400px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: 1rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.stat-card .label {
  font-size: 0.875rem;
  color: #64748b;
  margin-bottom: 0.5rem;
}

.stat-card .value {
  font-size: 2rem;
  font-weight: bold;
  color: #1e293b;
}
</style>
