<template>
  <div class="checklists-page page-container">
    <section class="page-top">
      <div>
        <div class="page-tag">Чек-листы</div>
        <h1>Выберите план уборки</h1>
        <p>Ежедневная, еженедельная, сезонная уборка и организация пространства.</p>
      </div>
    </section>

    <section class="checklist-grid">
      <div v-for="item in checklists" :key="item.id" :class="['checklist-card', selectedChecklist?.id === item.id ? 'active' : '']" @click="selectChecklist(item)">
        <div class="card-head">
          <span class="card-type">{{ item.type }}</span>
          <span class="card-duration">{{ item.duration }} мин</span>
        </div>
        <h3>{{ item.title }}</h3>
        <p>{{ item.description }}</p>
        <div class="card-meta">
          <span>{{ item.tasks.length }} задач</span>
          <button class="p-button p-button-text">Открыть</button>
        </div>
      </div>
    </section>

    <section v-if="selectedChecklist" class="detail-panel">
      <div class="detail-header">
        <div>
          <div class="page-tag">Текущая программа</div>
          <h2>{{ selectedChecklist.title }}</h2>
          <p>{{ selectedChecklist.description }}</p>
        </div>
        <div class="timer-card">
          <div class="timer-label">Таймер</div>
          <div class="timer-value">{{ minutes }}:{{ seconds }}</div>
          <div class="timer-actions">
            <button class="p-button p-button-outlined" @click="toggleTimer">{{ timerRunning ? 'Пауза' : 'Старт' }}</button>
            <button class="p-button p-button-text" @click="resetTimer">Сброс</button>
          </div>
        </div>
      </div>

      <div class="tasks-list">
        <div v-for="(task, index) in selectedChecklist.tasks" :key="index" class="task-row">
          <span class="task-number">{{ index + 1 }}</span>
          <div>
            <p class="task-title">{{ task }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watchEffect } from 'vue'

const checklists = [
  {
    id: 1,
    type: 'Ежедневная',
    title: 'Быстрая уборка за 20 минут',
    description: 'Самый простой план для поддержания порядка каждый день.',
    duration: 20,
    tasks: [
      'Собрать мусор и полотенца',
      'Протереть рабочие поверхности',
      'Пропылесосить одну комнату',
      'Проверить ванную и зеркало'
    ]
  },
  {
    id: 2,
    type: 'Еженедельная',
    title: 'Глубокая уборка за 1 час',
    description: 'Полный цикл уборки ключевых зон на неделю вперед.',
    duration: 60,
    tasks: [
      'Вытереть пыль и протереть полки',
      'Помыть полы и ковры',
      'Очистить кухонную зону',
      'Почистить ванную и унитаз',
      'Вынести мусор и проветрить комнаты'
    ]
  },
  {
    id: 3,
    type: 'Сезонная',
    title: 'Весенняя уборка',
    description: 'Разбейте генеральную уборку на понятные шаги.',
    duration: 120,
    tasks: [
      'Очистить шкафы и ящики',
      'Вытереть пыль со всех поверхностей',
      'Постирать шторы и текстиль',
      'Помыть окна и зеркала',
      'Организовать растения и аксессуары'
    ]
  },
  {
    id: 4,
    type: 'По дому',
    title: 'Уборка по всем зонам',
    description: 'Системный подход для каждого помещения.',
    duration: 90,
    tasks: [
      'Оценить текущее состояние комнаты',
      'Разобрать поверхности и убрать вещи',
      'Провести влажную уборку пола',
      'Протереть технику и мебель',
      'Проверить систему хранения'
    ]
  },
  {
    id: 5,
    type: 'Организация',
    title: 'Организация пространства',
    description: 'Упорядочьте вещи и создайте устойчивую систему.',
    duration: 45,
    tasks: [
      'Разобрать полки и отделения',
      'Разделить вещи по категориям',
      'Подписать контейнеры и коробки',
      'Очистить рабочие и кухонные поверхности',
      'Проверить заметки и списки задач'
    ]
  }
]

const selectedChecklist = ref(checklists[0])
const timerRunning = ref(false)
const secondsLeft = ref(selectedChecklist.value.duration * 60)

const minutes = computed(() => String(Math.floor(secondsLeft.value / 60)).padStart(2, '0'))
const seconds = computed(() => String(secondsLeft.value % 60).padStart(2, '0'))

let timerId = null

const tick = () => {
  if (secondsLeft.value > 0) {
    secondsLeft.value -= 1
  } else {
    timerRunning.value = false
    clearInterval(timerId)
  }
}

const toggleTimer = () => {
  timerRunning.value = !timerRunning.value
  if (timerRunning.value) {
    timerId = setInterval(tick, 1000)
  } else {
    clearInterval(timerId)
  }
}

const resetTimer = () => {
  timerRunning.value = false
  clearInterval(timerId)
  secondsLeft.value = selectedChecklist.value.duration * 60
}

const selectChecklist = (item) => {
  selectedChecklist.value = item
  resetTimer()
}

watchEffect(() => {
  secondsLeft.value = selectedChecklist.value.duration * 60
})
</script>

<style scoped>
.checklists-page {
  padding: 1.5rem 1.5rem 2rem;
}

.page-top {
  margin-bottom: 1.8rem;
}

.page-tag {
  display: inline-flex;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  background: rgba(38, 208, 124, 0.12);
  color: #14532d;
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

.checklist-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-bottom: 1.8rem;
}

.checklist-card {
  background: #ffffff;
  border: 1px solid rgba(29, 42, 79, 0.08);
  border-radius: 24px;
  padding: 1.5rem;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.checklist-card.active,
.checklist-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 18px 44px rgba(33, 85, 136, 0.09);
}

.card-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.card-type {
  font-size: 0.85rem;
  font-weight: 700;
  color: #0f172a;
}

.card-duration {
  font-size: 0.85rem;
  color: #667085;
}

.checklist-card h3 {
  font-size: 1.15rem;
  margin-bottom: 0.75rem;
  color: #102a43;
}

.checklist-card p {
  color: #475569;
  line-height: 1.7;
  margin-bottom: 1.2rem;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #64748b;
  font-size: 0.95rem;
}

.detail-panel {
  background: #f9fbff;
  border: 1px solid rgba(29, 42, 79, 0.08);
  border-radius: 24px;
  padding: 1.5rem;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.timer-card {
  min-width: 220px;
  border-radius: 24px;
  background: linear-gradient(180deg, #ffffff, #eaf7ff);
  border: 1px solid rgba(38, 208, 124, 0.18);
  padding: 1.2rem;
  text-align: center;
}

.timer-label {
  color: #0f172a;
  font-size: 0.9rem;
  margin-bottom: 0.45rem;
}

.timer-value {
  font-size: 2.7rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 0.9rem;
}

.timer-actions {
  display: flex;
  justify-content: center;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.tasks-list {
  display: grid;
  gap: 0.9rem;
}

.task-row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  background: #ffffff;
  border-radius: 18px;
  padding: 1rem 1.2rem;
  border: 1px solid rgba(16, 42, 67, 0.08);
}

.task-number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #26d07c;
  color: #ffffff;
  display: grid;
  place-items: center;
  font-weight: 700;
}

.task-title {
  color: #102a43;
  line-height: 1.75;
}

@media (max-width: 900px) {
  .checklist-grid {
    grid-template-columns: 1fr;
  }

  .detail-header {
    flex-direction: column;
  }
}
</style>