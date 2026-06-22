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
          <Button v-if="!isAuthenticated" as="router-link" to="/register" label="Зарегистрироваться" severity="primary" />
          <Button v-if="!isAuthenticated" as="router-link" to="/login" label="Войти" severity="secondary" text />
        </div>
        <div v-if="isAuthenticated" class="flex gap-3 flex-wrap mt-4">
          <Button as="router-link" to="/analytics" label="Моя статистика" icon="pi pi-chart-line" severity="secondary" text />
          <Button as="router-link" to="/achievements" label="Достижения" icon="pi pi-trophy" severity="secondary" text />
        </div>
      </div>
    </section>

    <div v-if="isAuthenticated" class="user-plans-container mb-10">
      <DailyPlanBlock />
      <SeasonalPlanBlock />
    </div>

    <section v-else class="hero-timer mb-10">
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

    <section v-if="!isAuthenticated" class="info-blocks grid gap-5 mb-10">
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
            <li v-for="item1 in ['Всегда двигайтесь от верха вниз — пыль, потом пол.', 'Сначала соберите мусор, затем влажную уборку.', 'Используйте таймер: 20 минут на одну зону делают задачу проще.', 'Разбивайте большую уборку на короткие циклы.']" :key="item1">
              <i class="pi pi-info-circle text-primary-500 mr-2"></i> {{ item1 }}
            </li>
          </ul>
        </template>
      </Card>
    </section>

    <section v-if="!isAuthenticated" class="checklist-section mb-10">
      <div class="mb-6">
        <h2 class="text-3xl font-bold mb-2">Ежедневный чек-лист</h2>
        <p class="text-gray-500">Быстрая уборка дома: готово за один подход.</p>
      </div>

      <div class="mb-5">
        <Accordion :value="0">
          <AccordionPanel value="0">
            <AccordionHeader>Подготовьте инвентарь</AccordionHeader>
            <AccordionContent >
              <ul class="grid grid-cols-2 md:grid-cols-3 gap-2 list-none p-0 m-0 text-gray-600">
                <li v-for="item in inventory" :key="item">
                  <i class="pi pi-box mr-2 text-sm"></i> {{ item }}
                </li>
              </ul>
            </AccordionContent >
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

    <section v-if="!isAuthenticated" class="season-challenges mb-10">
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
import { reactive, ref, computed, onUnmounted, onMounted } from 'vue'
import { useHead } from '@unhead/vue'
import { useAuthStore } from '@/stores/auth';
import axios from 'axios';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Checkbox from 'primevue/checkbox';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent  from 'primevue/accordioncontent';
import DailyPlanBlock from '@/components/DailyPlanBlock.vue';
import SeasonalPlanBlock from '@/components/SeasonalPlanBlock.vue';

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

const authStore = useAuthStore();
const isAuthenticated = computed(() => authStore.isAuthenticated);

const challenges = ref<Challenge[]>([]);
const taskSections = ref<ChecklistSection[]>([]);

async function fetchTemplates() {
  try {
    const res = await axios.get('http://localhost:5000/api/templates');
    challenges.value = res.data.seasonal;
    taskSections.value = res.data.checklist;
  } catch (err) {
    console.error('Failed to fetch templates:', err);
  }
}

onMounted(fetchTemplates);

const formattedTimer = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60);
  const seconds = remainingSeconds.value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
});

const inventory = [
  'Метла', 'Совок', 'Пылесос', 'Салфетки', 'Универсальное средство',
  'Мусорные пакеты', 'Средство для мытья посуды', 'Губка', 'Полотенце', 'Ёршик', 'Швабра'
];

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
