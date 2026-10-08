<script setup lang="ts">
/**
 * Главная «Сегодня» по макетам docs/design/mockups/main page 1-2.
 *
 * Публичные данные (челленджи, чек-листы, справочник достижений) приходят
 * с сервера. Персональные (план дня, заработанные достижения) подтягиваются
 * только для авторизованного пользователя — авторизация на httpOnly-cookie,
 * поэтому запросы идут через тот же origin.
 */

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

interface ChallengeTask {
  id: number;
  title: string;
  hint: string | null;
  room: string | null;
  estimated_minutes: number;
  is_done: boolean;
}

interface ChallengeDay {
  id: number;
  day_number: number;
  title: string;
  tasks: ChallengeTask[];
}

interface ActiveChallenge {
  userChallengeId: number;
  challenge: {
    id: number;
    slug: string;
    title: string;
    description: string | null;
    days_count: number;
    tasks_count: number;
  };
  progress: { done: number; total: number; percent: number; minutesLeft: number; currentDay: number | null };
  days: ChallengeDay[];
}

interface ActiveChallengeResponse {
  active: ActiveChallenge | null;
}

const { t } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
const api = useApi();

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

const { data: activeChallenge } = await useAsyncData('active-challenge', () =>
  auth.isAuthenticated
    ? api.request<ActiveChallengeResponse>('/api/challenges/active')
    : Promise.resolve(null),
);

const seasonal = computed(() => templates.value?.seasonal ?? []);
const featured = computed(() => seasonal.value[0] ?? null);
const upcoming = computed(() => seasonal.value[1] ?? null);
const checklists = computed(() => templates.value?.checklist ?? []);

const checklistTasksTotal = computed(() =>
  checklists.value.reduce((sum, checklist) => sum + checklist.items.length, 0),
);

const achievementsList = computed(() => achievements.value ?? []);
const earnedCodes = computed(() => new Set((earned.value ?? []).map((item) => item.code)));

const planTasks = computed(() => today.value?.summary.total_tasks ?? checklistTasksTotal.value);
const planMinutes = computed(() => today.value?.summary.total_estimated_time ?? 0);
const completedTasks = computed(() => today.value?.summary.completed_tasks ?? 0);

const active = computed(() => activeChallenge.value?.active ?? null);

/** День челленджа, который пользователь проходит сейчас. */
const currentDay = computed(() => {
  const state = active.value;
  if (!state?.progress.currentDay) {
    return null;
  }
  return state.days.find((day) => day.day_number === state.progress.currentDay) ?? null;
});

const dayTaskCount = computed(() => currentDay.value?.tasks.length ?? planTasks.value);
const dayMinutesLeft = computed(() => {
  const day = currentDay.value;
  if (!day) {
    return planMinutes.value;
  }
  return day.tasks.filter((task) => !task.is_done).reduce((sum, task) => sum + task.estimated_minutes, 0);
});

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

    <!-- Активный челлендж, а для гостя — ближайший из шаблонов -->
    <section v-if="active || featured" class="card card--mint card--challenge">
      <div class="card__head">
        <span class="badge">
          <i class="pi pi-circle-fill" aria-hidden="true" />
          {{ t('home.inProgress') }}
        </span>
        <span class="card__art" aria-hidden="true">⚑</span>
      </div>
      <h2 class="card__title">{{ active?.challenge.title ?? featured?.title }}</h2>
      <div class="progress">
        <div class="progress__fill" :style="{ width: `${active?.progress.percent ?? 0}%` }" />
      </div>
      <p class="card__meta">
        {{ active?.progress.done ?? 0 }} /
        {{ active?.progress.total ?? featured?.steps.length ?? 0 }} ·
        {{ active?.progress.percent ?? 0 }}%
      </p>
      <p v-if="active?.progress.currentDay" class="card__text">
        {{ t('home.currentDay') }} {{ active.progress.currentDay }}:
        {{ t('home.minutesLeft') }} {{ active.progress.minutesLeft }}
      </p>
    </section>

    <!-- Следующий челлендж -->
    <section v-if="upcoming" class="card card--mint">
      <span class="badge badge--plain">
        <i class="pi pi-flag" aria-hidden="true" />
        {{ t('home.challenges') }}
      </span>
      <h2 class="card__title">{{ upcoming.title }}</h2>
      <p class="card__text">{{ upcoming.desc }}</p>
    </section>

    <!-- План дня -->
    <section class="plan">
      <span class="plan__chip">{{ t('home.planChip') }}</span>

      <template v-if="auth.isAuthenticated">
        <p class="plan__count">
          <strong>{{ dayTaskCount }}</strong>
          <span>{{ t('home.tasks') }}</span>
        </p>
        <p v-if="dayMinutesLeft" class="plan__minutes">{{ dayMinutesLeft }} {{ t('home.minutes') }}</p>
        <NuxtLink
          v-if="active"
          :to="localePath(`/challenges/${active.challenge.slug}`)"
          class="btn btn--accent"
        >
          {{ t('home.openPlan') }}
        </NuxtLink>
      </template>

      <template v-else>
        <p class="plan__guest">{{ t('auth.guestHint') }}</p>
        <NuxtLink :to="localePath('/login')" class="btn btn--accent">
          {{ t('auth.login') }}
        </NuxtLink>
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
        <span class="badge badge--amber">{{ t('home.weekStats') }}</span>
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
        <span class="badge badge--mint">{{ t('home.allTasks') }}</span>
        <h3 class="widget__title">{{ t('home.taskManagement') }}</h3>
        <p class="widget__text">{{ t('home.schedule') }}</p>
        <p class="widget__value">{{ planTasks }}</p>
        <p class="widget__caption">{{ t('home.tasks') }}</p>
        <NuxtLink :to="localePath('/checklists')" class="widget__link">
          {{ t('home.schedule') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </article>
    </section>

    <!-- Достижения -->
    <section class="card card--mint achievements">
      <header class="achievements__head">
        <span class="card__icon card__icon--mint" aria-hidden="true"><i class="pi pi-trophy" /></span>
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
          <span class="achievement__art" aria-hidden="true">
            {{ earnedCodes.has(item.code) ? '🏆' : '🏅' }}
          </span>
          <div class="achievement__body">
            <strong>{{ item.name }}</strong>
            <small>{{ item.description }}</small>
            <div class="achievement__progress">
              <div class="progress progress--small">
                <div
                  class="progress__fill"
                  :class="{ 'progress__fill--full': earnedCodes.has(item.code) }"
                />
              </div>
              <span>{{ earnedCodes.has(item.code) ? item.criteria_value : 0 }}/{{ item.criteria_value }}</span>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- Совет дня: тексты приедут из @nuxt/content в Фазе 5 -->
    <section class="card card--task tip">
      <span class="card__icon card__icon--task" aria-hidden="true"><i class="pi pi-lightbulb" /></span>
      <div>
        <h2 class="card__title">{{ t('home.tipOfTheDay') }}</h2>
        <p class="card__text">{{ t('home.tipOfTheDayHint') }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* ── Общие карточки ─────────────────────────────────────────────────── */
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

.card__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.card__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.card__art {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--r-thumb);
  background: var(--c-surface);
  color: var(--c-brand);
  font-size: 1.5rem;
}

.card__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  border-radius: var(--r-thumb);
  background: var(--c-surface);
  color: var(--c-brand);
  font-size: 1.25rem;
}

.card__icon--mint {
  background: var(--c-bg);
}

.card__icon--task {
  background: var(--c-bg);
  color: var(--c-accent);
}

.tip {
  flex-direction: row;
  align-items: center;
  gap: var(--space-4);
}

/* ── Метки ──────────────────────────────────────────────────────────── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: var(--r-pill);
  background: var(--c-bg);
  color: var(--c-brand);
  font-size: var(--fs-caption);
  font-weight: 600;
}

.badge .pi-circle-fill {
  font-size: 0.5rem;
}

.badge--plain {
  background: transparent;
  padding-left: 0;
}

.badge--amber {
  background: var(--c-amber-soft);
  color: var(--c-amber);
}

.badge--mint {
  background: var(--c-bg);
  color: var(--c-brand);
}

.progress {
  height: 10px;
  border-radius: var(--r-pill);
  background: var(--c-track);
  overflow: hidden;
}

.progress--small {
  height: 6px;
}

.progress__fill {
  width: 0%;
  height: 100%;
  border-radius: var(--r-pill);
  background: var(--c-brand);
}

.progress__fill--full {
  width: 100%;
}

/* ── План дня ───────────────────────────────────────────────────────── */
.plan {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-4);
  border-radius: 50%;
  aspect-ratio: 1 / 1;
  justify-content: center;
  background: radial-gradient(circle at 50% 45%, var(--c-surface-warm) 0%, var(--c-bg) 72%);
  text-align: center;
}

.plan__chip {
  padding: 6px 14px;
  border-radius: var(--r-pill);
  background: var(--c-accent-soft);
  color: var(--c-accent);
  font-size: var(--fs-caption);
  font-weight: 600;
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
  color: var(--c-text-muted);
  max-width: 24ch;
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

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 0 var(--space-5);
  border: none;
  border-radius: var(--r-pill);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.btn--accent {
  background: var(--c-accent);
  color: var(--c-text-on-accent);
}

.btn--accent:hover {
  background: var(--c-accent-hover);
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
  gap: var(--space-3);
  align-items: center;
}

.achievement__art {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border-radius: var(--r-thumb);
  background: var(--c-surface);
  font-size: 1.25rem;
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

.achievement__progress .progress {
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

/* ── Состояния ──────────────────────────────────────────────────────── */
.state {
  color: var(--c-text-muted);
}

.state--error {
  color: var(--c-danger);
}
</style>
