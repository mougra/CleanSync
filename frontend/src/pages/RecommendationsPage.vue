<template>
  <div class="recommendations-page">
    <h1 class="page-title">Рекомендации по уборке</h1>

    <!-- Room Recommendations -->
    <h2 class="section-title">Рекомендации по комнатам</h2>
    <div class="grid">
      <div v-for="rec in recommendations" :key="rec.id" class="card">
        <h3>{{ rec.room }}</h3>
        <p>{{ rec.tip }}</p>
        <div class="badges">
          <span class="badge">{{ rec.frequency }}</span>
          <span class="badge">⏱️ {{ rec.time }}</span>
        </div>
      </div>
    </div>

    <!-- Tips -->
    <h2 class="section-title">Полезные советы</h2>
    <div class="tips-list">
      <div v-for="tip in tips" :key="tip.id" class="recommendation-card">
        <h4>{{ tip.title }}</h4>
        <p>{{ tip.text }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
const recommendations = [
  {
    id: 1,
    room: 'Кухня',
    tip: 'Еженедельная уборка кухни включает: мытье посуды, протирание столешниц, уборку плиты и микроволновки. Не забывайте проверять срок годности продуктов!',
    frequency: 'Еженедельно',
    time: '30-40 мин'
  },
  {
    id: 2,
    room: 'Ванная',
    tip: 'Чистите ванну и раковину специальными средствами 2 раза в неделю. Не забудьте про зеркало и полотенца. Проветривайте помещение после использования.',
    frequency: '2 раза в неделю',
    time: '20-30 мин'
  },
  {
    id: 3,
    room: 'Спальня',
    tip: 'Еженедельная уборка спальни: пылесос, протирание поверхностей. Меняйте постельное белье раз в 1-2 недели. Проветривайте помещение ежедневно.',
    frequency: 'Еженедельно',
    time: '20 мин'
  },
  {
    id: 4,
    room: 'Гостиная',
    tip: 'Раз в неделю: пылесос, протирание мебели и полок. Раз в месяц - мытье окон и генеральная уборка. Ежедневно убирайте подушки и одеяла.',
    frequency: 'Еженедельно',
    time: '30 мин'
  },
  {
    id: 5,
    room: 'Коридор',
    tip: 'Пылесос 2 раза в неделю, влажная уборка полов 1 раз в неделю. Регулярно чистите входную дверь и зеркала. Протирайте спички и включатели.',
    frequency: '2 раза в неделю',
    time: '15 мин'
  },
  {
    id: 6,
    room: 'Балкон',
    tip: 'Еженедельно: подметание и протирание пыли. Раз в месяц - влажная уборка. Проверяйте растения, если они есть. Убирайте листья и грязь.',
    frequency: 'Еженедельно',
    time: '15 мин'
  }
]

const tips = [
  {
    id: 1,
    title: '🧼 Выбор средств для уборки',
    text: 'Используйте экологичные средства для уборки. Они безопаснее для здоровья и окружающей среды. Не смешивайте различные химикаты!'
  },
  {
    id: 2,
    title: '⏰ Правило двух минут',
    text: 'Если уборка займет менее 2 минут, сделайте ее сразу. Это поможет поддерживать чистоту постоянно и избежать скопления грязи.'
  },
  {
    id: 3,
    title: '🎯 Система зон',
    text: 'Разделите дом на зоны и убирайте одну зону в день. Это более эффективно, чем полная генеральная уборка один раз в месяц.'
  },
  {
    id: 4,
    title: '🕐 Оптимальное время',
    text: 'Лучше всего убирать в первой половине дня, когда у вас больше энергии. Утренняя уборка также помогает настроиться на продуктивный день.'
  },
  {
    id: 5,
    title: '🎵 Музыка и мотивация',
    text: 'Включите любимую музыку или подкаст во время уборки. Это сделает процесс более приятным и поможет вам двигаться быстрее.'
  },
  {
    id: 6,
    title: '🗑️ Правило "один раз"',
    text: 'Когда вы берете предмет, сразу же поместите его на место. Не откладывайте вещи в "стопку для позже" - это увеличивает беспорядок.'
  }
]
</script>

<style scoped>
.recommendations-page {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-title {
  color: #26d07c;
  margin-bottom: 2rem;
  font-size: 2rem;
}

.section-title {
  color: #26d07c;
  margin: 3rem 0 1.5rem;
  font-size: 1.5rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-bottom: 2rem;
}

.card {
  background: #1a1f3a;
  border: 1px solid #2a3050;
  border-radius: 8px;
  padding: 1.5rem;
  transition: all 0.3s ease;
}

.card:hover {
  border-color: #26d07c;
  box-shadow: 0 0 20px rgba(38, 208, 124, 0.1);
}

.card h3 {
  color: #26d07c;
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
}

.card p {
  color: #a0a0a0;
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.badges {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: rgba(38, 208, 124, 0.1);
  color: #26d07c;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}

.tips-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.recommendation-card {
  background: #1a1f3a;
  border-left: 4px solid #26d07c;
  border-radius: 8px;
  padding: 1.5rem;
  transition: all 0.3s ease;
}

.recommendation-card:hover {
  border-left-color: #1fb570;
  box-shadow: 0 0 20px rgba(38, 208, 124, 0.1);
}

.recommendation-card h4 {
  color: #26d07c;
  margin-bottom: 0.5rem;
  font-size: 1.05rem;
}

.recommendation-card p {
  color: #a0a0a0;
  font-size: 0.9rem;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .page-title {
    font-size: 1.5rem;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
