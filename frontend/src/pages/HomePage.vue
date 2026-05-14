<template>
  <div class="home-page">
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Clean Planner</span>
        <h1>Убирайтесь без стресса — даже без аккаунта</h1>
        <p>
          Исследуйте сезонные челленджи, полезные советы и быстрые ежедневные чек-листы.
          Зарегистрируйтесь только когда захотите создать собственные задачи и графики.
        </p>
        <div class="hero-buttons">
          <router-link class="btn btn-primary" to="/register">Зарегистрироваться</router-link>
          <router-link class="btn btn-secondary" to="/login">Войти</router-link>
        </div>
      </div>
      <div class="hero-card">
        <div class="hero-card-title">Ежедневная уборка за 86 минут</div>
        <div class="hero-card-text">
          Быстрый старт: подготовьте инвентарь, запустите таймер и выполняйте шаги по комнатам.
        </div>
        <div class="timer-block">
          <div class="timer-value">{{ formattedTimer }}</div>
          <button class="btn btn-start" @click="toggleTimer">
            {{ timerRunning ? 'Пауза' : 'Запустить таймер' }}
          </button>
        </div>
      </div>
    </section>

    <section class="info-blocks">
      <article class="info-card">
        <h2>Весенний челлендж</h2>
        <p>
          Лёгкая весенняя уборка: проветрите комнаты, протрите поверхности, освободите пространство от лишнего.
          Один элемент в день — и квартира постепенно становится свежее.
        </p>
        <ul>
          <li>Освежите кухню: помойте рабочую поверхность и почистите холодильник.</li>
          <li>Сделайте ревизию в шкафах: отберите вещи для пожертвования.</li>
          <li>Проведите точечную чистку санузла и замените полотенца.</li>
        </ul>
      </article>

      <article class="info-card">
        <h2>Советы по уборке</h2>
        <ul>
          <li>Всегда двигайтесь от верха вниз — пыль, потом пол.</li>
          <li>Сначала соберите мусор, затем влажную уборку.</li>
          <li>Используйте таймер: 20 минут на одну зону делают задачу проще.</li>
          <li>Разбивайте большую уборку на короткие циклы.</li>
        </ul>
      </article>
    </section>

    <section class="checklist-section">
      <div class="section-header">
        <h2>Ежедневный чек-лист</h2>
        <p>Быстрая уборка дома: готово за один подход.</p>
      </div>

      <details open class="inventory-panel">
        <summary>Подготовьте инвентарь</summary>
        <ul>
          <li>Метла</li>
          <li>Совок</li>
          <li>Пылесос</li>
          <li>Салфетки</li>
          <li>Универсальное чистящее средство</li>
          <li>Мусорные пакеты</li>
          <li>Средство для мытья посуды</li>
          <li>Губка</li>
          <li>Чистое полотенце</li>
          <li>Ёршик для унитаза</li>
          <li>Швабра</li>
        </ul>
      </details>

      <div class="tasks-grid">
        <div class="task-card" v-for="section in taskSections" :key="section.title">
          <h3>{{ section.title }}</h3>
          <ul>
            <li v-for="item in section.items" :key="item.id">
              <label>
                <input type="checkbox" v-model="item.done" />
                {{ item.text }}
              </label>
            </li>
          </ul>
        </div>
      </div>

      <button class="btn btn-clear" @click="resetChecklist">Сбросить чек-лист</button>
    </section>

    <section class="season-challenges">
      <h2>Сезонные челленджи</h2>
      <div class="season-cards">
        <div class="season-card">
          <h3>Летний челлендж</h3>
          <p>Легкая поддержка: проветривание, вынос мусора, очищение от летней пыли.</p>
          <ul>
            <li>Проверьте окна и балкон, уберите пыль.</li>
            <li>Постирайте легкие занавески и прихватки.</li>
            <li>Обработайте сантехнику и удалите следы от воды.</li>
          </ul>
        </div>
        <div class="season-card">
          <h3>Осенний челлендж</h3>
          <p>Подготовка к холодам: очистите входные зоны и протрите поверхности от пыли.</p>
          <ul>
            <li>Чистка ковров и мягкой мебели.</li>
            <li>Выбросьте накопившиеся пакеты и старые продукты.</li>
            <li>Проведите влажную уборку кухни и ванной комнаты.</li>
          </ul>
        </div>
        <div class="season-card">
          <h3>Зимний челлендж</h3>
          <p>Комфорт и порядок: уборка для уюта и безопасности дома.</p>
          <ul>
            <li>Почистите и организуйте шкафы с зимней одеждой.</li>
            <li>Почистите поверхности от пыли и жирных пятен.</li>
            <li>Проверьте батареи и вентиляцию.</li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onUnmounted } from 'vue'

const remainingSeconds = ref(86 * 60)
const timerRunning = ref(false)
let intervalId = null

const formattedTimer = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60)
  const seconds = remainingSeconds.value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

const taskSections = reactive([
  {
    title: 'Кухня',
    items: [
      { id: 1, text: 'Разгрузите и вымойте столешницу', done: false },
      { id: 2, text: 'Помойте посуду или загрузите посудомойку', done: false },
      { id: 3, text: 'Вымойте раковину', done: false },
      { id: 4, text: 'Замените кухонное полотенце на чистое', done: false },
      { id: 5, text: 'Вытрите фасады бытовой техники', done: false },
      { id: 6, text: 'Выбросьте мусор', done: false },
    ]
  },
  {
    title: 'Гостиная',
    items: [
      { id: 7, text: 'Сложите вещи на свои места', done: false },
      { id: 8, text: 'Пропылесосьте пол и мебель', done: false },
      { id: 9, text: 'Протрите телевизор и пыль на полках', done: false },
      { id: 10, text: 'Проветрите комнату', done: false },
    ]
  },
  {
    title: 'Ванная комната',
    items: [
      { id: 11, text: 'Протрите раковину и смеситель', done: false },
      { id: 12, text: 'Чистка унитаза ершиком', done: false },
      { id: 13, text: 'Протирка зеркал', done: false },
      { id: 14, text: 'Поменяйте полотенца', done: false },
    ]
  },
  {
    title: 'Спальня',
    items: [
      { id: 15, text: 'Заправьте кровать', done: false },
      { id: 16, text: 'Разберите вещи, разложите по местам', done: false },
      { id: 17, text: 'Пропылесосьте пол', done: false },
      { id: 18, text: 'Протрите прикроватные тумбочки', done: false },
    ]
  }
])

const tick = () => {
  if (remainingSeconds.value > 0) {
    remainingSeconds.value -= 1
  } else {
    stopTimer()
  }
}

const startTimer = () => {
  if (intervalId) return
  if (remainingSeconds.value === 0) {
    remainingSeconds.value = 86 * 60
  }
  intervalId = setInterval(tick, 1000)
  timerRunning.value = true
}

const stopTimer = () => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  timerRunning.value = false
}

const toggleTimer = () => {
  if (timerRunning.value) {
    stopTimer()
  } else {
    startTimer()
  }
}

const resetChecklist = () => {
  taskSections.forEach((section) => {
    section.items.forEach((item) => {
      item.done = false
    })
  })
  remainingSeconds.value = 86 * 60
  stopTimer()
}

onUnmounted(() => {
  stopTimer()
})
</script>

<style scoped>
.home-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}

.hero {
  display: grid;
  grid-template-columns: 1.3fr 0.7fr;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 40px;
}

.hero-copy {
  padding: 32px;
  background: #16203b;
  border-radius: 20px;
  color: white;
}

.eyebrow {
  display: inline-block;
  margin-bottom: 16px;
  color: #7df5b8;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.hero-copy h1 {
  font-size: 2.8rem;
  margin-bottom: 18px;
  line-height: 1.05;
}

.hero-copy p {
  color: #d7d7e2;
  line-height: 1.8;
  margin-bottom: 26px;
}

.hero-buttons {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 22px;
  border-radius: 999px;
  font-weight: 600;
  text-decoration: none;
}

.btn-primary {
  background: #26d07c;
  color: #091524;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.12);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.hero-card {
  background: white;
  padding: 28px;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(9, 21, 36, 0.08);
}

.hero-card-title {
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 12px;
}

.hero-card-text {
  color: #5c647c;
  line-height: 1.75;
  margin-bottom: 20px;
}

.timer-block {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.timer-value {
  font-size: 3rem;
  font-weight: 700;
  color: #1f3d7a;
}

.btn-start {
  padding: 14px 22px;
  border: none;
  border-radius: 14px;
  background: #26d07c;
  color: #091524;
  cursor: pointer;
}

.info-blocks {
  display: grid;
  gap: 20px;
  margin-bottom: 40px;
}

.info-card {
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 20px 40px rgba(9, 21, 36, 0.05);
  padding: 28px;
}

.info-card h2 {
  margin-bottom: 14px;
}

.info-card p,
.info-card ul {
  color: #4d556d;
  line-height: 1.8;
}

.info-card ul {
  padding-left: 18px;
}

.info-card li {
  margin-bottom: 10px;
}

.checklist-section {
  margin-bottom: 40px;
}

.section-header {
  margin-bottom: 24px;
}

.section-header h2 {
  margin-bottom: 8px;
}

.inventory-panel {
  background: #f8fafc;
  border-radius: 18px;
  padding: 18px 22px;
  margin-bottom: 20px;
}

.inventory-panel summary {
  font-weight: 700;
  cursor: pointer;
  margin-bottom: 12px;
}

.inventory-panel ul {
  padding-left: 18px;
  margin-top: 8px;
}

.inventory-panel li {
  margin-bottom: 8px;
  color: #374151;
}

.tasks-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 18px;
}

.task-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 22px;
  box-shadow: 0 16px 40px rgba(9, 21, 36, 0.05);
}

.task-card h3 {
  margin-bottom: 14px;
}

.task-card ul {
  padding-left: 18px;
}

.task-card li {
  margin-bottom: 12px;
}

.task-card label {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #334155;
}

.btn-clear {
  padding: 12px 18px;
  border: none;
  border-radius: 14px;
  background: #f1f5f9;
  color: #1f2937;
  cursor: pointer;
}

.season-challenges {
  margin-bottom: 40px;
}

.season-challenges h2 {
  margin-bottom: 18px;
}

.season-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.season-card {
  background: #ffffff;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 16px 40px rgba(9, 21, 36, 0.05);
}

.season-card h3 {
  margin-bottom: 12px;
}

.season-card p,
.season-card ul {
  color: #475569;
  line-height: 1.8;
}

@media (max-width: 992px) {
  .hero {
    grid-template-columns: 1fr;
  }

  .tasks-grid,
  .season-cards {
    grid-template-columns: 1fr;
  }
}
</style>
