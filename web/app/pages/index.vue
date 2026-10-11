<script setup lang="ts">
/**
 * Главная «Сегодня» по макетам docs/design/mockups/main page 1-2.
 *
 * Публичные данные (шаблоны чек-листов, справочник достижений, список челленджей)
 * приходят во время серверного рендера. Персональные (активный челлендж, план дня,
 * заработанные достижения) — только для вошедшего: авторизация на httpOnly-cookie.
 */

import type { AchievementProgress } from '~/types/achievement';
import type { StatsPeriod } from '~/types/stats';
import type { TodayPlan } from '~/types/task';

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

const { t } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
const api = useApi();

const { active, current, seasonChallenge } = await useChallenges();

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

// Достижения: прогресс по каждому — из общего composable (тот же ключ, что
// на экране достижений), гостю показываем справочник без прогресса.
const { catalog: achievementsCatalog, progress: achievementsProgress, earned: achievementsEarned, total: achievementsTotal } =
  await useAchievements();
const { show: showAchievements } = useAchievementToast();

const { data: today } = await useAsyncData('today-plan', () =>
  auth.isAuthenticated ? api.request<TodayPlan>('/api/tasks/today') : Promise.resolve(null),
);

const checklists = computed(() => templates.value?.checklist ?? []);
const checklistTasksTotal = computed(() =>
  checklists.value.reduce((sum, checklist) => sum + checklist.items.length, 0),
);

const showcase = computed<AchievementProgress[]>(() =>
  auth.isAuthenticated
    ? achievementsProgress.value.slice(0, 2)
    : achievementsCatalog.value.slice(0, 2).map((item) => ({ ...item, current: 0, earned: false })),
);

/** Челлендж сезона закрыт пользователем — до следующего сезона на главной его нет. */
const challengeCompleted = computed(() => current.value.status === 'completed');

/**
 * «План на сегодня» — только свои задачи и план по дому.
 *
 * Задачи челленджа сюда не подмешиваются: челлендж — отдельная сущность, и
 * живёт он в своей карточке. Раньше задачи дня челленджа попадали в чипы плана,
 * из-за чего один и тот же пункт виделся в двух местах.
 */
const planTotal = computed(() => today.value?.summary.total_tasks ?? 0);
const planDone = computed(() => today.value?.summary.completed_tasks ?? 0);
const planMinutes = computed(() => today.value?.summary.total_estimated_time ?? 0);

/** Ближайшие пункты плана: в карточке хватает трёх, остальное — на экране целиком. */
const upcomingTasks = computed(() =>
  Object.values(today.value?.tasks ?? {})
    .flat()
    .filter((task) => !task.is_completed)
    .map((task) => ({ key: `own-${task.id}`, title: task.title }))
    .slice(0, 3),
);

const tasksWidgetValue = computed(
  () => today.value?.summary.total_tasks ?? checklistTasksTotal.value,
);

/**
 * Статистика на главной берётся из того же источника, что и раздел
 * «Статистика»: числа обязаны совпадать, иначе виджет врёт.
 */
const statsPeriod = ref<StatsPeriod>('week');
const { overview: statsOverview } = await useStats(statsPeriod);
const statsValue = computed(() => statsOverview.value?.last7.tasks ?? 0);
const statsNote = computed(() => formatClock(statsOverview.value?.last7.minutes ?? 0));

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
    const response = await api.request<{ awarded?: string[] }>(`/api/habits/${habit.id}/toggle`, {
      method: 'POST',
    });

    await refreshHabits();
    await refreshNuxtData('achievements-progress');
    await showAchievements(response.awarded);
  } finally {
    habitBusy.value = null;
  }
};

const { data: tip } = await useAsyncData('tip-of-the-day', () =>
  queryCollection('tips').order('order', 'ASC').first(),
);

useSeoMeta({
  title: () => t('nav.today'),
  description: () => t('home.metaDescription'),
});

const site = useSiteConfig();

/**
 * Приложение бесплатное и устанавливается на телефон, поэтому размечаем его
 * как SoftwareApplication: в выдаче это даёт строку «Бесплатно».
 */
useStructuredData(() => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${site.url}/#app`,
      name: 'TidyPlan',
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'Web',
      description: t('home.metaDescription'),
      url: site.url,
      inLanguage: 'ru-RU',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
    },
  ],
}));
</script>

<template>
  <div class="home">
    <p v-if="templatesError" class="state state--error">
      {{ t('state.error') }}<br >
      <small>{{ t('state.errorHint') }}</small>
    </p>

    <!-- Челлендж, который пользователь проходит: прогресс, полоса и текущий день -->
    <ChallengeCard
      v-if="active"
      :title="active.challenge.title"
      :badge-label="t('home.inProgress')"
      :progress="active.progress"
      :note="currentDayNote"
      :cover-url="active.challenge.cover_url"
      :to="localePath(`/challenges/${active.challenge.slug}`)"
    />

    <!--
      Сезонный челлендж, который ещё не начат: кнопки «начать» нет — задачи
      отмечаются сразу на экране челленджа, поэтому карточка просто ведёт туда.
    -->
    <ChallengeCard
      v-else-if="seasonChallenge"
      :title="seasonChallenge.title"
      :description="seasonChallenge.description"
      :badge-label="t('home.challenges')"
      :cover-url="seasonChallenge.cover_url"
      :to="localePath(`/challenges/${seasonChallenge.slug}`)"
    />

    <!-- Челлендж сезона закрыт: на главной остаётся только нейтральная строка -->
    <p v-else-if="challengeCompleted" class="home__note">{{ t('home.challengeCompleted') }}</p>

    <div class="section-head">
      <h2 class="section-head__title">{{ t('home.readyToStart') }}</h2>
      <NuxtLink :to="localePath('/challenges')" class="section-head__link">
        {{ t('home.allChallenges') }}
        <i class="pi pi-chevron-right" aria-hidden="true" />
      </NuxtLink>
    </div>

    <!-- План дня: доля закрытых задач в кольце, без «круга во весь экран» -->
    <section class="plan card">
      <div class="plan__head">
        <AppBadge variant="accent">{{ t('home.planChip') }}</AppBadge>
        <p v-if="planMinutes" class="plan__minutes">{{ planMinutes }} {{ t('home.minutes') }}</p>
      </div>

      <template v-if="auth.isAuthenticated">
        <div class="plan__body">
          <PlanRing :done="planDone" :total="planTotal" />

          <div class="plan__aside">
            <p class="plan__hint">{{ t('home.planHint') }}</p>
          </div>
        </div>
      </template>

      <template v-else>
        <p class="plan__guest">{{ t('auth.guestHint') }}</p>
        <AppButton variant="accent" :to="localePath('/login')">{{ t('auth.login') }}</AppButton>
      </template>

      <ul v-if="upcomingTasks.length" class="plan__list">
        <li v-for="task in upcomingTasks" :key="task.key">
          {{ task.title }}
        </li>
      </ul>
      <ul v-else-if="checklists.length" class="plan__list">
        <li v-for="checklist in checklists" :key="checklist.title">
          {{ checklist.title }} — {{ checklist.items.length }}
        </li>
      </ul>
    </section>

    <!-- Серия и недельная цель: день засчитывается за любой закрытый пункт -->
    <StreakCard v-if="auth.isAuthenticated" />

    <!-- Дом: общий план семьи и кто что делает -->
    <HouseholdCard v-if="auth.isAuthenticated" />

    <!-- Виджеты -->
    <section class="widgets">
      <article class="card card--warm widget">
        <AppBadge variant="amber">{{ t('home.weekStats') }}</AppBadge>
        <h3 class="widget__title">{{ t('home.weekStats') }}</h3>
        <p class="widget__text">{{ t('home.weekStatsHint') }}</p>
        <p class="widget__value">{{ statsValue }}</p>
        <p class="widget__caption">{{ t('home.last7') }} · {{ statsNote }}</p>
        <NuxtLink :to="localePath('/analytics')" class="widget__link">
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

    <!--
      Привычки и достижения стоят рядом: на десктопе это две колонки, на телефоне
      привычный столбик. Гостю привычек не показываем, и тогда достижения
      занимают всю ширину (см. `.home__pair:has(> :only-child)`).
    -->
    <div class="home__pair">

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
            {{ achievementsEarned }}/{{ achievementsTotal }} {{ t('home.achievementsDone') }}
          </p>
        </div>
        <NuxtLink :to="localePath('/achievements')" class="chip-link">
          {{ t('home.seeAll') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </header>

      <ul class="achievements__list">
        <li v-for="item in showcase" :key="item.code" class="achievement">
          <span class="icon-box icon-box--surface" aria-hidden="true">
            {{ item.earned ? '🏆' : '🏅' }}
          </span>
          <div class="achievement__body">
            <strong>{{ item.name }}</strong>
            <small>{{ item.description }}</small>
            <div class="achievement__progress">
              <ProgressBar
                thin
                :value="Math.round((item.current / item.criteria_value) * 100)"
              />
              <span>{{ item.current }}/{{ item.criteria_value }}</span>
            </div>
          </div>
        </li>
      </ul>
    </section>

    </div>

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
  transition:
    transform var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
}

/* Лёгкий подъём карточки под курсором: только там, где есть настоящий указатель */
@media (hover: hover) and (pointer: fine) {
  .card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-lift);
  }
}

@media (min-width: 768px) {
  /* Десктоп: больше воздуха и две колонки там, где раньше всё шло в столбик */
  .home {
    gap: var(--space-6);
  }

  .card {
    padding: var(--space-5);
  }

  .plan {
    padding: var(--space-6);
  }

  .plan__body {
    flex-direction: row;
    align-items: center;
    gap: var(--space-7);
    text-align: left;
  }

  .plan__aside {
    justify-items: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .card:hover {
    transform: none;
    transition: none;
  }
}

.card--mint {
  background: var(--c-surface-mint);
}

.card--warm {
  background: var(--c-surface-warm);
}

/*
 * Нейтральная строка вместо карточки: челлендж сезона закрыт и до следующего
 * сезона на главной не показывается (со слов заказчика).
 */
.home__note {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
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
/* ── План дня ───────────────────────────────────────────────────────────
 * Раньше это был круг во всю ширину экрана: много места и мало смысла.
 * Теперь карточка с компактным кольцом, а на десктопе — две колонки.
 */
.plan {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  border-radius: var(--r-card);
  background: var(--grad-warm);
}

.plan__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.plan__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  text-align: center;
}

.plan__aside {
  display: grid;
  gap: var(--space-3);
  justify-items: center;
}

.plan__hint {
  margin: 0;
  max-width: 34ch;
  color: var(--c-text-muted);
}

.plan__minutes {
  margin: 0;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.plan__guest {
  margin: 0;
  max-width: 24ch;
  color: var(--c-text-muted);
}

/* Ближайшие пункты — чипами: видно, что делать дальше, и не занимает пол-экрана */
.plan__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.plan__list li {
  padding: 6px 12px;
  border-radius: var(--r-pill);
  background: var(--c-surface);
  box-shadow: var(--shadow-soft);
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

/* ── Десктопные детали ──────────────────────────────────────────────────
 * На широком экране столбик из виджетов выглядел сиротливо: собираем в две
 * колонки и даём картинке совета больше места.
 */
@media (min-width: 768px) {
  .widgets {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-5);
  }

  .tip__image {
    height: 220px;
  }
}

/* ── Привычки и достижения рядом ────────────────────────────────────────
 * Две карточки одинаковой природы: короткие списки с прогрессом. В две колонки
 * они читаются лучше и не заставляют листать главную.
 */
@media (min-width: 1024px) {
  .home__pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-5);
    align-items: start;
  }

  /* Гость: привычек нет, значит достижения занимают всю ширину */
  .home__pair:has(> :only-child) {
    grid-template-columns: 1fr;
  }
}
</style>
