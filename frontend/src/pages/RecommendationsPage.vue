<template>
  <div class="recommendations-page p-4 max-w-screen-xl mx-auto">
    <h1 class="page-title text-3xl font-bold mb-6">Рекомендации по уборке</h1>

    <h2 class="section-title text-2xl font-bold mb-4">Рекомендации по комнатам</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
      <Card v-for="rec in recommendations" :key="rec.id" class="shadow-1">
        <template #title>
          <div class="text-xl font-bold text-primary-500">{{ rec.room }}</div>
        </template>
        <template #content>
          <p class="text-gray-600 mb-4">{{ rec.tip }}</p>
          <div class="flex gap-2 flex-wrap">
            <Tag :value="rec.frequency" severity="secondary" />
            <Tag value="⏱️" :label="rec.time" severity="secondary" />
          </div>
        </template>
      </Card>
    </div>

    <h2 class="section-title text-2xl font-bold mb-4">Полезные советы</h2>
    <div class="flex flex-column gap-4">
      <Card v-for="tip in tips" :key="tip.id" class="shadow-1 border-left-4 border-primary-500">
        <template #title>
          <div class="text-lg font-bold">{{ tip.title }}</div>
        </template>
        <template #content>
          <p class="text-gray-600">{{ tip.text }}</p>
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import Card from 'primevue/card';
import Tag from 'primevue/tag';

interface RoomRec {
  id: number;
  room: string;
  tip: string;
  frequency: string;
  time: string;
}

interface GeneralTip {
  id: number;
  title: string;
  text: string;
}

const recommendations: RoomRec[] = [
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
];

const tips: GeneralTip[] = [
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
];
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
</style>
