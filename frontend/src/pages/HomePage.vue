<template>
  <div class="home-page">
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Clean Planner</span>
        <h1 class="text-4xl font-bold mb-4">Убирайтесь без стресса — даже без аккаунта</h1>
        <p class="text-gray-300 leading-relaxed mb-6">
          Исследуйте сезонные челленджи, полезные советы и быстрые ежедневные чек-листы.
          Зарегистрируйтесь только когда захотите создать собственные задачи и графики.
        </p>
        <div class="flex gap-3 flex-wrap">
          <Button as="router-link" to="/register" label="Зарегистрироваться" severity="primary" />
          <Button as="router-link" to="/login" label="Войти" severity="secondary" text />
        </div>
      </div>
      <div class="hero-card p-6 bg-white rounded-3xl shadow-xl">
        <div class="text-xl font-bold mb-3">Ежедневная уборка за 86 минут</div>
        <div class="text-gray-500 leading-relaxed mb-5">
          Быстрый старт: подготовьте инвентарь, запустите таймер и выполняйте шаги по комнатам.
        </div>
        <div class="flex gap-4 align-items-center flex-wrap">
          <div class="text-5xl font-bold text-primary-700">{{ formattedTimer }}</div>
          <Button :label="timerRunning ? 'Пауза' : 'Запустить таймер'" @click="toggleTimer" severity="primary" />
        </div>
      </div>
    </section>

    <section class="info-blocks grid gap-5 mb-10">
      <Card class="shadow-1">
        <template #title>
          <div class="text-xl font-bold">Весенний челлендж</div>
        </template>
        <template #content>
          <p class="text-gray-600 mb-4">
            Лёгкая весенняя уборка: проветрите комнаты, протрите поверхности, освободите пространство от лишнего.
            Один элемент в день — и квартира постепенно становится свежее.
          </p>
          <ul class="list-none p-0 m-0 flex flex-column gap-2 text-gray-600">
            <li v-for="item in ['Освежите кухню: помойте рабочую поверхность и почистите холодильник.', 'Сделайте ревизию в шкафах: отберите вещи для пожертвования.', 'Проведите точечную чистку санузла и замените полотенца.']" :key="item">
              <i class="pi pi-check-circle text-primary-500 mr-2"></i> {{ item }}
            </li>
          </ul>
        </template>
      </Card>

      <Card class="shadow-1">
        <template #title>
          <div class="text-xl font-bold">Советы по уборке</div>
        </template>
        <template #content>
          <ul class="list-none p-0 m-0 flex flex-column gap-2 text-gray-600">
            <li v-for="item in ['Всегда двигайтесь от верха вниз — пыль, потом пол.', 'Сначала соберите мусор, затем влажную уборку.', 'Используйте таймер: 20 минут на одну зону делают задачу проще.', 'Разбивайте большую уборку на короткие циклы.']" :key="item">
              <i class="pi pi-info-circle text-primary-500 mr-2"></i> {{ item }}
            </li>
          </ul>
        </template>
      </Card>
    </section>

    <section class="checklist-section mb-10">
      <div class="mb-6">
        <h2 class="text-3xl font-bold mb-2">Ежедневный чек-лист</h2>
        <p class="text-gray-500">Быстрая уборка дома: готово за один подход.</p>
      </div>

      <div class="mb-5">
        <Accordion :value="0">
          <AccordionPanel value="0">
            <AccordionHeader>Подготовьте инвентарь</AccordionHeader>
            <AccordionPanelContent>
              <ul class="grid grid-cols-2 md:grid-cols-3 gap-2 list-none p-0 m-0 text-gray-600">
                <li v-for="item in inventory" :key="item">
                  <i class="pi pi-box mr-2 text-sm"></i> {{ item }}
                </li>
              </ul>
            </AccordionPanelContent>
          </AccordionPanel>
        </Accordion>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card v-for="section in taskSections" :key="section.title" class="shadow-1">
          <template #title>
            <div class="text-lg font-bold">{{ section.title }}</div>
          </template>
          <template #content>
            <ul class="list-none p-0 m-0 flex flex-column gap-3">
              <li v-for="item in section.items" :key="item.id" class="flex align-items-center gap-3">
                <Checkbox v-model="item.done" :binary="true" />
                <span :class="{ 'line-through text-gray-400': item.done }" class="text-gray-700">
                  {{ item.text }}
                </span>
              </li>
            </ul>
          </template>
        </Card>
      </div>

      <Button label="Сбросить чек-лист" icon="pi pi-refresh" severity="secondary" text @click="resetChecklist" />
    </section>

    <section class="season-challenges mb-10">
      <h2 class="text-3xl font-bold mb-6">Сезонные челленджи</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card v-for="challenge in challenges" :key="challenge.title" class="shadow-1">
          <template #title>
            <div class="text-xl font-bold">{{ challenge.title }}</div>
          </template>
          <template #content>
            <p class="text-gray-600 mb-4">{{ challenge.desc }}</p>
            <ul class="list-none p-0 m-0 flex flex-column gap-2 text-gray-600">
              <li v-for="step in challenge.steps" :key="step">
                <i class="pi pi-check-circle text-primary-500 mr-2"></i> {{ step }}
              </li>
            </ul>
          </template>
        </Card>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onUnmounted } from 'vue'
import { useHead } from '@unhead/vue'
import Button from 'primevue/button';
import Card from 'primevue/card';
import Checkbox from 'primevue/checkbox';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionPanelContent from 'primevue/accordionpanelcontent';

interface ChecklistItem {
  id: number;
  text: string;
  done: boolean;
}

interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

interface Challenge {
  title: string;
  desc: string;
  steps: string[];
}

// SEO
useHead({
  title: 'CleanPlanner — Убирайтесь без стресса',
  meta: [
    { name: 'description', content: 'Бесплатный планировщик уборки: чек-листы, сезонные челленджи и таймер для быстрой очистки дома.' },
    { name: 'keywords', content: 'уборка, планировщик, чек-лист, клининг, порядок в доме' }
  ],
});

const remainingSeconds = ref(86 * 60);
const timerRunning = ref(false);
let intervalId: number | null = null;

const formattedTimer = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60);
  const seconds = remainingSeconds.value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
});

const inventory = [
  'Метла', 'Совок', 'Пылесос', 'Салфетки', 'Универсальное средство',
  'Мусорные пакеты', 'Средство для мытья посуды', 'Губка', 'Полотенце', 'Ёршик', 'Швабра'
];

const challenges: Challenge[] = [
  {
    title: 'Летний челлендж',
    desc: 'Легкая поддержка: проветривание, вынос мусора, очищение от летней пыли.',
    steps: ['Проверьте окна и балкон, уберите пыль.', 'Постирайте легкие занавески и прихватки.', 'Обработайте сантехнику и удалите следы от воды.']
  },
  {
    title: 'Осенний челлендж',
    desc: 'Подготовка к холодам: очистите входные зоны и протрите поверхности от пыли.',
    steps: ['Чистка ковров и мягкой мебели.', 'Выбросьте накопившиеся пакеты и старые продукты.', 'Проведите влажную уборку кухни и ванной комнаты.']
  },
  {
    title: 'Зимний челлендж',
    desc: 'Комфорт и порядок: уборка для уюта и безопасности дома.',
    steps: ['Почистите и организуйте шкафы с зимней одеждой.', 'Почистите поверхности от пыли и жирных пятен.', 'Проверьте батареи и вентиляцию.']
  }
];

const taskSections = reactive<ChecklistSection[]>([
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
]);

const tick = () => {
  if (remainingSeconds.value > 0) {
    remainingSeconds.value -= 1;
  } else {
    stopTimer();
  }
};

const startTimer = () => {
  if (intervalId) return;
  if (remainingSeconds.value === 0) {
    remainingSeconds.value = 86 * 60;
  }
  intervalId = window.setInterval(tick, 1000);
  timerRunning.value = true;
};

const stopTimer = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  timerRunning.value = false;
};

const toggleTimer = () => {
  if (timerRunning.value) {
    stopTimer();
  } else {
    startTimer();
  }
};

const resetChecklist = () => {
  taskSections.forEach((section) => {
    section.items.forEach((item) => {
      item.done = false;
    });
  });
  remainingSeconds.value = 86 * 60;
  stopTimer();
};

onUnmounted(() => {
  stopTimer();
});
</script>
