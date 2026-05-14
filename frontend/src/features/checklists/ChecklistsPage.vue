<template>
  <div class="checklists-page page-container">
    <section class="page-top">
      <div>
        <div class="page-tag">Чек-листы</div>
        <h1>Планы уборки для любого дня</h1>
        <p>Выберите готовый план или добавьте свой собственный сценарий уборки.</p>
      </div>
      <button class="btn btn-primary">Создать план</button>
    </section>

    <section class="plans-grid">
      <div v-for="item in plans" :key="item.id" class="plan-card">
        <div class="plan-head">
          <div>
            <h3>{{ item.name }}</h3>
            <p>{{ item.description }}</p>
          </div>
          <span class="plan-badge">{{ item.taskCount }} задач</span>
        </div>
        <div class="plan-items">
          <div v-for="task in item.tasks" :key="task" class="plan-task">{{ task }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
const plans = [
  {
    id: 1,
    name: 'Утренний чек-лист',
    description: 'Быстрая уборка перед началом дня.',
    taskCount: 5,
    tasks: ['Проветрить', 'Сделать кровать', 'Протереть стол', 'Собрать мусор', 'Протереть зеркало'],
  },
  {
    id: 2,
    name: 'Вечерний ритуал',
    description: 'Подготовка дома к комфортному вечеру.',
    taskCount: 4,
    tasks: ['Убрать посуду', 'Подмести пол', 'Сложить вещи', 'Проверить освещение'],
  },
  {
    id: 3,
    name: 'Глубокая уборка',
    description: 'Системный план для всей квартиры.',
    taskCount: 8,
    tasks: ['Пылесос', 'Мойка пола', 'Протирка мебели', 'Чистка ванной', 'Организация шкафов'],
  },
]
</script>

<style scoped>
.checklists-page {
  padding: 1.5rem 0 2rem;
}

.page-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.75rem;
}

.page-tag {
  display: inline-flex;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
  font-size: 0.86rem;
  font-weight: 700;
  margin-bottom: 0.7rem;
}

h1 {
  font-size: 2.2rem;
  margin-bottom: 0.7rem;
  color: #102a43;
}

p {
  color: #4d5a7b;
  max-width: 640px;
}

.plans-grid {
  display: grid;
  gap: 1rem;
}

.plan-card {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 28px;
  padding: 1.5rem;
  box-shadow: 0 22px 55px rgba(15, 23, 42, 0.05);
}

.plan-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.plan-head h3 {
  font-size: 1.15rem;
  margin-bottom: 0.35rem;
  color: #102a43;
}

.plan-head p {
  color: #475569;
  margin: 0;
}

.plan-badge {
  background: rgba(38, 208, 124, 0.12);
  color: #166534;
  padding: 0.45rem 0.9rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.9rem;
}

.plan-items {
  display: grid;
  gap: 0.75rem;
}

.plan-task {
  border-radius: 18px;
  background: #f8fbff;
  padding: 0.9rem 1rem;
  color: #102a43;
  border: 1px solid rgba(59, 130, 246, 0.12);
}

.btn {
  padding: 0.95rem 1.45rem;
  border-radius: 999px;
  border: none;
  font-weight: 700;
  cursor: pointer;
  background: #3d68ff;
  color: white;
}

@media (max-width: 900px) {
  .page-top {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>