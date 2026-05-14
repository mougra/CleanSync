<template>
  <div class="insights-page page-container">
    <section class="page-top">
      <div>
        <div class="page-tag">Инсайты</div>
        <h1>Полезные советы и идеи для дома</h1>
        <p>Тематические подборки для мотивации, организации и комфортной уборки.</p>
      </div>
    </section>

    <section class="insights-grid">
      <div v-for="item in insights" :key="item.id" class="insight-card" @click="openInsight(item)">
        <div class="insight-badge">{{ item.category }}</div>
        <h3>{{ item.title }}</h3>
        <p>{{ item.excerpt }}</p>
        <div class="insight-footer">
          <span>{{ item.duration }}</span>
          <span>{{ item.popularity }}</span>
        </div>
      </div>
    </section>

    <Dialog header="{{ selectedInsight?.title }}" v-model:visible="detailVisible" :modal="true" :closable="true" :style="{ width: '520px' }">
      <div class="detail-body" v-if="selectedInsight">
        <p class="detail-text">{{ selectedInsight.detail }}</p>
        <div class="detail-tags">
          <span class="detail-tag">Категория: {{ selectedInsight.category }}</span>
          <span class="detail-tag">Сложность: {{ selectedInsight.level }}</span>
          <span class="detail-tag">Читать: {{ selectedInsight.readTime }}</span>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Dialog from 'primevue/dialog'

const insights = [
  {
    id: 1,
    title: 'Новые советы по организации холодильника',
    category: 'Советы',
    excerpt: 'Как хранить продукты удобно, чтобы все было видно и свежо.',
    duration: '4 мин',
    popularity: '🔥 1.2K',
    level: 'Легкий',
    readTime: '5 мин',
    detail: 'Разделите холодильник на зоны: овощи, напитки, соусы и готовые блюда. Используйте прозрачные контейнеры и подписывайте полки. Это сократит время поиска и снизит риск порчи продуктов.'
  },
  {
    id: 2,
    title: 'Осознанный цифровой детокс',
    category: 'Лайфстайл',
    excerpt: 'Советы о том, как освободить пространство от лишних гаджетов и уведомлений.',
    duration: '6 мин',
    popularity: '🔥 980',
    level: 'Средний',
    readTime: '7 мин',
    detail: 'Оставьте только самые нужные устройства на виду, остальные храните в закрытых ящиках. Настройте режим «Не беспокоить» на уборку и выделите 15 минут на удаление ненужных приложений и рассылок.'
  },
  {
    id: 3,
    title: 'Советы, как сделать дом удобнее',
    category: 'Комфорт',
    excerpt: 'Решения, которые упрощают ежедневную уборку и создают уют.',
    duration: '5 мин',
    popularity: '🔥 1.5K',
    level: 'Лёгкий',
    readTime: '6 мин',
    detail: 'Установите корзины для одежды в каждой комнате, держите под рукой набор для быстрой уборки и используйте шкафы с разделителями. Это помогает сократить время на поиск вещей и сохраняет порядок.'
  },
  {
    id: 4,
    title: 'Как избежать выгорания от уборки',
    category: 'Мотивация',
    excerpt: 'Планируйте легкие задачи и отдыхайте между подходами.',
    duration: '7 мин',
    popularity: '🔥 1.1K',
    level: 'Средний',
    readTime: '6 мин',
    detail: 'Чередуйте быстрые задания и перерывы. Делайте уборку по 20 минут, чтобы не устать, и поощряйте себя за каждую выполненную цель. Включайте любимую музыку и создавайте список побед.'
  },
  {
    id: 5,
    title: 'Советы от экспертов по чистоте',
    category: 'Эксперты',
    excerpt: 'Лучшие лайфхаки от профессионалов клининга и организации пространства.',
    duration: '5 мин',
    popularity: '🔥 820',
    level: 'Продвинутый',
    readTime: '8 мин',
    detail: 'Используйте чистящие средства по назначению, не смешивайте химикаты и давайте каждой зоне высохнуть. Добавьте утреннюю рутину: убери одну полку, протри одну поверхность, убери три предмета с пола.'
  },
  {
    id: 6,
    title: 'Рутина для комфортного дома',
    category: 'Рутина',
    excerpt: 'Как выстроить ежедневную и еженедельную систему уборки без лишнего напряжения.',
    duration: '6 мин',
    popularity: '🔥 1.3K',
    level: 'Лёгкий',
    readTime: '6 мин',
    detail: 'Утром проводите 10 минут на проветривание и сбор мусора, вечером — проверку ключевых зон. Выделите один день для ванной и кухонных поверхностей, другой — для пылесоса и наполнения корзин.'
  }
]

const selectedInsight = ref(null)
const detailVisible = ref(false)

const openInsight = (item) => {
  selectedInsight.value = item
  detailVisible.value = true
}
</script>

<style scoped>
.insights-page {
  padding: 1.5rem 0 2rem;
}

.page-top {
  margin-bottom: 1.8rem;
}

.page-tag {
  display: inline-flex;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  background: rgba(255, 118, 117, 0.14);
  color: #d64535;
  font-size: 0.86rem;
  font-weight: 700;
  margin-bottom: 0.7rem;
}

h1 {
  font-size: 2.2rem;
  margin-bottom: 0.7rem;
  color: #1d2a4f;
}

p {
  color: #4d5a7b;
  max-width: 640px;
}

.insights-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.insight-card {
  background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%);
  border: 1px solid rgba(29, 42, 79, 0.08);
  border-radius: 24px;
  padding: 1.6rem;
  cursor: pointer;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.insight-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 24px 48px rgba(31, 93, 202, 0.08);
}

.insight-badge {
  display: inline-flex;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  background: rgba(38, 208, 124, 0.12);
  color: #1f4f31;
  font-size: 0.8rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

.insight-card h3 {
  margin-bottom: 0.75rem;
  font-size: 1.15rem;
  color: #102a43;
}

.insight-card p {
  color: #5d6f8a;
  line-height: 1.75;
  margin-bottom: 1.35rem;
}

.insight-footer {
  display: flex;
  justify-content: space-between;
  color: #7b8aac;
  font-size: 0.95rem;
}

.detail-body {
  display: grid;
  gap: 1rem;
}

.detail-text {
  color: #243b55;
  line-height: 1.8;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.detail-tag {
  background: #eef6ff;
  color: #2154a4;
  padding: 0.45rem 0.9rem;
  border-radius: 999px;
  font-size: 0.85rem;
}

@media (max-width: 900px) {
  .insights-grid {
    grid-template-columns: 1fr;
  }
}
</style>