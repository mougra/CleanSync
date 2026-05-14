<template>
  <div class="home-page page-container">
    <section class="today-panel">
      <div class="date-row">
        <button class="nav-btn" @click="prevDay"><i class="pi pi-angle-left"></i></button>
        <div class="date-info">
          <div class="date-month">{{ monthLabel }}</div>
          <div class="date-day">{{ currentDayLabel }}</div>
        </div>
        <button class="nav-btn" @click="nextDay"><i class="pi pi-angle-right"></i></button>
      </div>

      <div class="hero-cards">
        <div class="hero-small-card card-soft">
          <div class="card-label">ИИ-план уборки</div>
          <div class="card-title">Получите персональный чек-лист за несколько секунд</div>
        </div>
        <div class="hero-small-card card-strong">
          <div class="card-label">Весенняя уборка</div>
          <div class="card-title">Обновите свой дом всего за 7 дней</div>
        </div>
      </div>

      <div class="main-card">
        <div class="main-card-top">
          <div>
            <span class="badge">Сегодняшний план</span>
            <h2>{{ completedTasks }}/{{ totalTasks }} • {{ totalMinutes }} мин</h2>
            <p>Быстрая программа для уборки именно сегодня.</p>
          </div>
          <button class="btn btn-primary">Начать</button>
        </div>

        <div class="progress-wrap">
          <div class="progress-label">{{ progressPercent }}% выполнено</div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <div class="today-tasks">
            <button
              v-for="task in tasks"
              :key="task.id"
              class="task-pill"
              :class="{ done: task.done }"
              @click="toggleTask(task)"
            >
              {{ task.text }}
            </button>
          </div>
          <div class="progress-note">100 пропущенных задач</div>
        </div>
      </div>

      <div class="quick-actions">
        <button class="btn btn-secondary">Статистика</button>
        <button class="btn btn-secondary">Все задачи</button>
      </div>
    </section>

    <section class="insights-preview">
      <div class="preview-header">
        <div>
          <div class="page-tag">Инсайты</div>
          <h2>Новые советы и идеи</h2>
        </div>
        <router-link class="link-primary" to="/insights">Перейти к статье</router-link>
      </div>
      <div class="preview-grid">
        <div class="preview-card">
          <h3>Новые советы по холодильнику</h3>
          <p>Организуйте продукты удобно и увеличьте срок их хранения.</p>
        </div>
        <div class="preview-card">
          <h3>Мотивация на уборку</h3>
          <p>Как делать уборку без выгорания и с поддержкой привычки.</p>
        </div>
      </div>
    </section>

    <section class="checklist-preview">
      <div class="preview-header">
        <div>
          <div class="page-tag">Чек-листы</div>
          <h2>Выберите свой план</h2>
        </div>
        <router-link class="link-primary" to="/checklists">Открыть все планы</router-link>
      </div>
      <div class="preview-grid">
        <div class="preview-card quiet">
          <h3>Ежедневная уборка</h3>
          <p>Короткий план для поддержания порядка.</p>
        </div>
        <div class="preview-card quiet">
          <h3>Уборка по дому</h3>
          <p>Системный подход для каждой комнаты.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const currentDate = ref(new Date())
const totalTasks = 4
const doneCount = ref(0)
const totalMinutes = 32

const monthLabel = computed(() => currentDate.value.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }))
const currentDayLabel = computed(() => currentDate.value.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' }))
const progressPercent = computed(() => Math.round((doneCount.value / totalTasks) * 100))

const tasks = ref([
  { id: 1, text: 'Проветрить комнаты', done: false },
  { id: 2, text: 'Протереть рабочие поверхности', done: false },
  { id: 3, text: 'Вынести мусор', done: false },
  { id: 4, text: 'Пропылесосить проходы', done: false }
])

const completedTasks = computed(() => tasks.value.filter((item) => item.done).length)

const toggleTask = (task) => {
  task.done = !task.done
  doneCount.value = completedTasks.value
}

const prevDay = () => {
  currentDate.value = new Date(currentDate.value.getTime() - 24 * 60 * 60 * 1000)
}

const nextDay = () => {
  currentDate.value = new Date(currentDate.value.getTime() + 24 * 60 * 60 * 1000)
}
</script>

<style scoped>
.home-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 1.5rem 1.5rem 2rem;
  display: grid;
  gap: 1.5rem;
}

.today-panel,
.insights-preview,
.checklist-preview {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 28px;
  padding: 1.5rem;
  box-shadow: 0 22px 55px rgba(15, 23, 42, 0.05);
}

.date-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.nav-btn {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #f8fbff;
  display: grid;
  place-items: center;
  color: #1d2939;
  cursor: pointer;
}

.date-info {
  text-align: center;
  flex: 1;
}

.date-month {
  font-size: 0.95rem;
  color: #475569;
}

.date-day {
  font-size: 1.8rem;
  font-weight: 700;
  color: #102a43;
}

.hero-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.hero-small-card {
  border-radius: 24px;
  padding: 1.3rem 1.25rem;
  min-height: 140px;
  display: grid;
  gap: 0.75rem;
}

.card-soft {
  background: #f7f9ff;
  border: 1px solid rgba(109, 125, 224, 0.18);
}

.card-strong {
  background: linear-gradient(135deg, #ffefdd, #ffe3be);
  border: 1px solid rgba(255, 152, 72, 0.22);
}

.card-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #334155;
}

.card-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #102a43;
  line-height: 1.55;
}

.main-card {
  border-radius: 28px;
  padding: 1.75rem;
  background: linear-gradient(180deg, #ffffff 0%, #eef5ff 100%);
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.main-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(38, 208, 124, 0.15);
  color: #166534;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
  margin-bottom: 0.65rem;
}

.main-card h2 {
  font-size: 2rem;
  color: #102a43;
  margin: 0.1rem 0 0.65rem;
}

.main-card p {
  color: #475569;
  max-width: 560px;
  line-height: 1.75;
}

.progress-wrap {
  display: grid;
  gap: 0.75rem;
}

.progress-label,
.progress-note {
  color: #475569;
  font-size: 0.95rem;
}

.progress-bar {
  height: 12px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #5b97ff, #3d68ff);
}

.today-tasks {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
}

.task-pill {
  padding: 0.75rem 1rem;
  border-radius: 18px;
  background: #f8fbff;
  border: 1px solid rgba(59, 130, 246, 0.14);
  color: #102a43;
  text-align: left;
  cursor: pointer;
  font-weight: 600;
}

.task-pill.done {
  background: #dbeafe;
  color: #1d4ed8;
  text-decoration: line-through;
}

.quick-actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.btn {
  padding: 0.95rem 1.45rem;
  border-radius: 999px;
  border: none;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.btn:hover {
  transform: translateY(-1px);
}

.btn-primary {
  background: #3d68ff;
  color: white;
}

.btn-secondary {
  background: #f8fbff;
  color: #102a43;
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.insights-preview,
.checklist-preview {
  display: grid;
  gap: 1.2rem;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.page-tag {
  display: inline-flex;
  padding: 0.45rem 0.9rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
  font-weight: 700;
  font-size: 0.85rem;
}

.insights-preview h2,
.checklist-preview h2 {
  margin: 0.3rem 0 0.1rem;
  font-size: 1.55rem;
  color: #102a43;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.preview-card {
  background: #f8fbff;
  border-radius: 24px;
  padding: 1.3rem;
  min-height: 140px;
  display: grid;
  gap: 0.8rem;
  border: 1px solid rgba(59, 130, 246, 0.12);
}

.preview-card h3 {
  font-size: 1.05rem;
  color: #102a43;
}

.preview-card p {
  color: #475569;
  line-height: 1.7;
}

.preview-card.quiet {
  background: #ffffff;
}

.link-primary {
  color: #3d68ff;
  font-weight: 700;
  text-decoration: none;
}

@media (max-width: 900px) {
  .hero-cards,
  .preview-grid,
  .quick-actions {
    grid-template-columns: 1fr;
  }

  .main-card-top,
  .preview-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
