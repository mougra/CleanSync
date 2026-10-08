<script setup lang="ts">
/**
 * Главная «Сегодня» по макетам docs/design/mockups/main page 1-2.
 *
 * Публичные данные (шаблоны чек-листов, справочник достижений, список челленджей)
 * приходят во время серверного рендера. Персональные (активный челлендж, план дня,
 * заработанные достижения) — только для вошедшего: авторизация на httpOnly-cookie.
 */

import type { ChallengeSummary } from '~/types/challenge';

interface SeasonalTemplate {
  title: string;
  desc: string;
  steps: string[];
}

interface ChecklistTemplate {
  title: string;
  items: { id: number; text: string; done: boolean }[];
}

interface TemplatesResponse {
  seasonal: SeasonalTemplate[];
  checklist: ChecklistTemplate[];
}

interface Achievement {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  criteria_value: number;
}

interface TodayPlan {
  summary: {
    total_tasks: number;
    completed_tasks: number;
    progress: number;
    total_estimated_time: number;
    remaining_time: number;
  };
}

const { t } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
const api = useApi();

const { active, available } = await useChallenges();

// Привычки: тот же composable, что и на вкладке «Привычки», ключи общие —
// отметка на главной сразу видна и там.
const { habits, dueToday, doneToday, refreshMine: refreshHabits } = await useHabits();
const { intervalLabel, categoryLabel } = useHabitLabels();
const habitBusy = ref<number | null>(null);

const { data: templates, error: templatesError } = await useAsyncData(
  'templates',
  () => api.request<TemplatesResponse>('/api/templates'),
  { default: () => ({ seasonal: [], checklist: [] }) },
);

const { data: achievements, error: achievementsError } = await useAsyncData(
  'achievements-all',
  () => api.request<Achievement[]>('/api/achievements'),
  { default: () => [] },
);

const { data: today } = await useAsyncData('today-plan', () =>
  auth.isAuthenticated ? api.request<TodayPlan>('/api/tasks/today') : Promise.resolve(null),
);

const { data: earned } = await useAsyncData('achievements-earned', () =>
  auth.isAuthenticated ? api.request<Achievement[]>('/api/achievements/user') : Promise.resolve(null),
);

const checklists = computed(() => templates.value?.checklist ?? []);
const checklistTasksTotal = computed(() =>
  checklists.value.reduce((sum, checklist) => sum + checklist.items.length, 0),
);

const achievementsList = computed(() => achievements.value ?? []);
const earnedCodes = computed(() => new Set((earned.value ?? []).map((item) => item.code)));

const nextChallenge = computed<ChallengeSummary | null>(() => available.value[0] ?? null);

/** День челленджа, который пользователь проходит сейчас. */
const currentDay = computed(() => {
  const state = active.value;
  if (!state?.progress.currentDay) {
    return null;
  }
  return state.days.find((day) => day.day_number === state.progress.currentDay) ?? null;
});

const dayTaskCount = computed(
  () => currentDay.value?.tasks.length ?? today.value?.summary.total_tasks ?? checklistTasksTotal.value,
);

const dayMinutesLeft = computed(() => {
  const day = currentDay.value;
  if (!day) {
    return today.value?.summary.total_estimated_time ?? 0;
  }
  return day.tasks.filter((task) => !task.is_done).reduce((sum, task) => sum + task.estimated_minutes, 0);
});

const completedTasks = computed(() => today.value?.summary.completed_tasks ?? 0);
const tasksWidgetValue = computed(
  () => today.value?.summary.total_tasks ?? checklistTasksTotal.value,
);

/** «День 3: осталось 55 мин» для карточки активного челленджа. */
const currentDayNote = computed(() => {
  const state = active.value;
  if (!state?.progress.currentDay) {
    return null;
  }
  return t('home.dayLeft', {
    day: state.progress.currentDay,
    minutes: state.progress.minutesLeft,
  });
});

const habitMeta = (habit: { category: string | null; intervalCount: number; intervalUnit: string; streak: number }) =>
  [
    categoryLabel(habit.category),
    intervalLabel(habit.intervalCount, habit.intervalUnit as 'once' | 'day' | 'week' | 'month'),
    habit.streak > 0 ? t('habits.streak', { count: habit.streak }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

const toggleHabit = async (habit: { id: number }) => {
  if (habitBusy.value !== null) {
    return;
  }

  habitBusy.value = habit.id;
  try {
    await api.request(`/api/habits/${habit.id}/toggle`, { method: 'POST' });
    await refreshHabits();
    await refreshNuxtData('achievements-earned');
  } finally {
    habitBusy.value = null;
  }
};

const { data: tip } = await useAsyncData('tip-of-the-day', () =>
  queryCollection('tips').order('order', 'ASC').first(),
);

useSeoMeta({
  title: () => t('nav.today'),
  description: () =>
    'Челленджи уборки по дням, готовые чек-листы и советы — чтобы навести порядок дома без выгорания.',
});
</script>

<template>
  <div class="home">
    <p v-if="templatesError || achievementsError" class="state state--error">
      {{ t('state.error') }}<br >
      <small>{{ t('state.errorHint') }}</small>
    </p>

    <!-- Активный челлендж с прогрессом -->
    <ChallengeCard
      v-if="active"
      :title="active.challenge.title"
      :badge-label="t('home.inProgress')"
      :progress="active.progress"
      :note="currentDayNote"
      :cover-url="active.challenge.cover_url"
      :to="localePath(`/challenges/${active.challenge.slug}`)"
    />

    <!-- Ближайший челлендж -->
    <ChallengeCard
      v-if="nextChallenge"
      :title="nextChallenge.title"
      :description="nextChallenge.description"
      :badge-label="t('home.challenges')"
      :cover-url="nextChallenge.cover_url"
      :to="localePath(`/challenges/${nextChallenge.slug}`)"
    />

    <div class="section-head">
      <h2 class="section-head__title">{{ t('home.readyToStart') }}</h2>
      <NuxtLink :to="localePath('/challenges')" class="section-head__link">
        {{ t('home.allChallenges') }}
        <i class="pi pi-chevron-right" aria-hidden="true" />
      </NuxtLink>
    </div>

    <!-- План дня -->
    <section class="plan">
      <AppBadge variant="accent">{{ t('home.planChip') }}</AppBadge>

      <template v-if="auth.isAuthenticated">
        <p class="plan__count">
          <strong>{{ dayTaskCount }}</strong>
          <span>{{ t('home.tasks') }}</span>
        </p>
        <p v-if="dayMinutesLeft" class="plan__minutes">{{ dayMinutesLeft }} {{ t('home.minutes') }}</p>
        <AppButton
          v-if="active"
          variant="accent"
          :to="localePath(`/challenges/${active.challenge.slug}`)"
        >
          {{ t('home.openPlan') }}
        </AppButton>
      </template>

      <template v-else>
        <p class="plan__guest">{{ t('auth.guestHint') }}</p>
        <AppButton variant="accent" :to="localePath('/login')">{{ t('auth.login') }}</AppButton>
      </template>

      <ul v-if="currentDay" class="plan__list">
        <li v-for="task in currentDay.tasks.filter((item) => !item.is_done)" :key="task.id">
          {{ task.title }}
        </li>
      </ul>
      <ul v-else-if="checklists.length" class="plan__list">
        <li v-for="checklist in checklists" :key="checklist.title">
          {{ checklist.title }} — {{ checklist.items.length }}
        </li>
      </ul>
    </section>

    <!-- Виджеты -->
    <section class="widgets">
      <article class="card card--warm widget">
        <AppBadge variant="amber">{{ t('home.weekStats') }}</AppBadge>
        <h3 class="widget__title">{{ t('home.weekStats') }}</h3>
        <p class="widget__text">{{ t('home.weekStatsHint') }}</p>
        <p class="widget__value">{{ completedTasks }}</p>
        <p class="widget__caption">{{ t('home.completed') }}</p>
        <NuxtLink :to="localePath('/habits')" class="widget__link">
          {{ t('home.seeProgress') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </article>

      <article class="card card--mint widget">
        <AppBadge>{{ t('home.allTasks') }}</AppBadge>
        <h3 class="widget__title">{{ t('home.taskManagement') }}</h3>
        <p class="widget__text">{{ t('home.schedule') }}</p>
        <p class="widget__value">{{ tasksWidgetValue }}</p>
        <p class="widget__caption">{{ t('home.tasks') }}</p>
        <NuxtLink :to="localePath('/checklists')" class="widget__link">
          {{ t('home.schedule') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </article>
    </section>

    <!-- Привычки на сегодня: отметить можно не уходя с главной -->
    <section v-if="auth.isAuthenticated" class="card card--mint habits">
      <header class="habits__head">
        <span class="icon-box" aria-hidden="true"><i class="pi pi-refresh" /></span>
        <div class="habits__summary">
          <h2 class="card__title">{{ t('home.habitsToday') }}</h2>
          <p class="card__meta">{{ doneToday.length }}/{{ habits.length }}</p>
        </div>
        <NuxtLink :to="localePath('/habits')" class="chip-link">
          {{ t('home.allHabits') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </header>

      <p v-if="habits.length === 0" class="habits__empty">
        <NuxtLink :to="localePath('/habits')" class="habits__link">
          {{ t('home.noHabits') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </p>

      <ul v-else class="habits__list">
        <li v-for="habit in [...dueToday, ...doneToday].slice(0, 4)" :key="habit.id">
          <HabitRow
            :title="habit.title"
            :icon="habit.icon"
            :done="habit.doneToday"
            :meta="habitMeta(habit)"
            :disabled="habitBusy !== null"
            @toggle="toggleHabit(habit)"
          />
        </li>
      </ul>
    </section>

    <!-- Достижения -->
    <section class="card card--mint achievements">
      <header class="achievements__head">
        <span class="icon-box" aria-hidden="true"><i class="pi pi-trophy" /></span>
        <div class="achievements__summary">
          <h2 class="card__title">{{ t('home.achievements') }}</h2>
          <p class="card__meta">
            {{ earnedCodes.size }}/{{ achievementsList.length }} {{ t('home.achievementsDone') }}
          </p>
        </div>
        <NuxtLink :to="localePath('/tips')" class="chip-link">
          {{ t('home.seeAll') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </header>

      <ul class="achievements__list">
        <li v-for="item in achievementsList.slice(0, 2)" :key="item.code" class="achievement">
          <span class="icon-box icon-box--surface" aria-hidden="true">
            {{ earnedCodes.has(item.code) ? '🏆' : '🏅' }}
          </span>
          <div class="achievement__body">
            <strong>{{ item.name }}</strong>
            <small>{{ item.description }}</small>
            <div class="achievement__progress">
              <ProgressBar
                thin
                :value="earnedCodes.has(item.code) ? 100 : 0"
              />
              <span>
                {{ earnedCodes.has(item.code) ? item.criteria_value : 0 }}/{{ item.criteria_value }}
              </span>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- Совет дня: первый материал из web/content/tips -->
    <NuxtLink v-if="tip" class="card card--task tip" :to="localePath(tip.path)">
      <img class="tip__image" :src="tip.cover" :alt="tip.title" loading="lazy" >
      <div class="tip__body">
        <AppBadge variant="amber">{{ t('home.tipOfTheDay') }}</AppBadge>
        <h2 class="card__title">{{ tip.title }}</h2>
        <p class="card__text">{{ tip.description }}</p>
        <span class="tip__more">
          {{ t('home.seeAll') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </span>
      </div>
    </NuxtLink>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--r-card);
}

.card--mint {
  background: var(--c-surface-mint);
}

.card--warm {
  background: var(--c-surface-warm);
}

.card--task {
  background: var(--c-surface-task);
}

.card__title {
  font-size: var(--fs-title);
}

.card__text,
.card__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.section-head__title {
  font-size: 1.25rem;
}

.section-head__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

.section-head__link:hover {
  color: var(--c-brand);
}

.icon-box {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  border-radius: var(--r-thumb);
  background: var(--c-bg);
  color: var(--c-brand);
  font-size: 1.25rem;
}

.icon-box--surface {
  background: var(--c-surface);
  font-size: 1.25rem;
}

.icon-box--accent {
  color: var(--c-accent);
}

/* ── План дня ───────────────────────────────────────────────────────── */
.plan {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  justify-content: center;
  padding: var(--space-6) var(--space-4);
  border-radius: 50%;
  aspect-ratio: 1 / 1;
  text-align: center;
  background: radial-gradient(circle at 50% 45%, var(--c-surface-warm) 0%, var(--c-bg) 72%);
}

.plan__count {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.plan__count strong {
  font-size: 2.75rem;
  line-height: 1;
}

.plan__count span {
  font-size: var(--fs-title);
}

.plan__minutes {
  color: var(--c-text-muted);
}

.plan__guest {
  max-width: 24ch;
  color: var(--c-text-muted);
}

.plan__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

/* ── Виджеты ────────────────────────────────────────────────────────── */
.widgets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
}

.widget {
  gap: var(--space-1);
}

.widget__title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.widget__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.widget__value {
  margin-top: var(--space-2);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
}

.widget__caption {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.widget__link {
  margin-top: auto;
  padding-top: var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--c-amber);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

.card--mint .widget__link {
  color: var(--c-brand);
}

/* ── Привычки ───────────────────────────────────────────────────────── */
.habits {
  gap: var(--space-4);
}

.habits__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.habits__summary {
  flex: 1;
  min-width: 0;
}

.habits__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.habits__empty {
  margin: 0;
}

.habits__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--tap-min);
  color: var(--c-brand);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

/* ── Достижения ─────────────────────────────────────────────────────── */
.achievements {
  gap: var(--space-4);
}

.achievements__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.achievements__summary {
  flex: 1;
  min-width: 0;
}

.achievements__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.achievement {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.achievement__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.achievement__body small {
  color: var(--c-text-muted);
}

.achievement__progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
  font-size: var(--fs-caption);
  color: var(--c-text-muted);
}

.achievement__progress :deep(.progress) {
  flex: 1;
}

.chip-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border-radius: var(--r-pill);
  background: var(--c-bg);
  color: var(--c-text);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

/* ── Совет дня ──────────────────────────────────────────────────────── */
.tip {
  gap: var(--space-3);
  padding: 0;
  overflow: hidden;
  color: var(--c-text);
  text-decoration: none;
}

.tip__more {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--c-accent);
  font-size: var(--fs-caption);
  font-weight: 600;
}

.tip__image {
  width: 100%;
  height: 160px;
  object-fit: cover;
  background: var(--c-surface-sunken);
}

.tip__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: 0 var(--space-4) var(--space-4);
}

/* ── Состояния ──────────────────────────────────────────────────────── */
.state {
  color: var(--c-text-muted);
}

.state--error {
  color: var(--c-danger);
}
</style>
