<script setup lang="ts">
/**
 * Статистика: активность за 30 дней, итоги, зоны и привычки.
 *
 * Данные собирает `/api/analytics/summary` — вместе по своим задачам,
 * челленджам и привычкам, потому что по отдельности картина неполная.
 */
import type { AnalyticsSummary, ActivityDay } from '~/types/analytics';

const { t, locale } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
const api = useApi();

const { data, error } = await useAsyncData('analytics-summary', () =>
  auth.isAuthenticated ? api.request<AnalyticsSummary>('/api/analytics/summary') : Promise.resolve(null),
);

const totals = computed(() => data.value?.totals ?? null);
const activity = computed<ActivityDay[]>(() => data.value?.activity ?? []);
const rooms = computed(() => data.value?.rooms ?? []);
const habits = computed(() => data.value?.habits ?? []);

const tasksDone = computed(() =>
  totals.value ? totals.value.ownTasks + totals.value.challengeTasks : 0,
);

/** Высота столбика в графике: относительно самого активного дня. */
const maxPerDay = computed(() =>
  Math.max(
    1,
    ...activity.value.map((day) => day.tasks + day.challenge_tasks + day.habit_checkins),
  ),
);

const dayTotal = (day: ActivityDay) => day.tasks + day.challenge_tasks + day.habit_checkins;

const heightOf = (value: number) => `${Math.round((value / maxPerDay.value) * 100)}%`;

const hasData = computed(
  () =>
    tasksDone.value > 0 ||
    (totals.value?.habitCheckins ?? 0) > 0 ||
    activity.value.some((day) => dayTotal(day) > 0),
);

/** «2 ч 20 мин» — та же функция, что в челленджах, чтобы единицы совпадали. */
const durationLabel = (minutes: number) => formatMinutes(minutes, locale.value);

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }).format(fromISODate(date));

/** Подписи под графиком показываем не под каждым столбиком, иначе каша. */
const showLabel = (index: number) => index % 5 === 0 || index === activity.value.length - 1;

useSeoMeta({
  title: () => t('analytics.title'),
  robots: 'noindex',
});
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('analytics.title') }}</h1>

    <p v-if="!auth.isAuthenticated" class="hint">{{ t('analytics.signIn') }}</p>

    <p v-else-if="error" class="hint hint--error">{{ t('state.error') }}</p>

    <template v-else>
      <p class="hint">{{ t('analytics.period') }}</p>

      <p v-if="!hasData" class="hint">{{ t('analytics.empty') }}</p>

      <template v-else>
        <section v-if="totals" class="totals">
          <article class="stat">
            <span class="stat__value">{{ tasksDone }}</span>
            <span class="stat__label">{{ t('analytics.tasksDone') }}</span>
          </article>
          <article class="stat">
            <span class="stat__value">{{ totals.habitCheckins }}</span>
            <span class="stat__label">{{ t('analytics.habitCheckins') }}</span>
          </article>
          <article class="stat">
            <span class="stat__value">{{ durationLabel(totals.minutes) }}</span>
            <span class="stat__label">{{ t('analytics.minutes') }}</span>
          </article>
          <article class="stat">
            <span class="stat__value">{{ totals.activeHabits }}</span>
            <span class="stat__label">{{ t('analytics.activeHabits') }}</span>
          </article>
        </section>

        <section class="card">
          <h2 class="card__title">{{ t('analytics.activity') }}</h2>

          <ul class="chart" role="img" :aria-label="t('analytics.activity')">
            <li v-for="(day, index) in activity" :key="day.date" class="chart__day">
              <span class="chart__bar" :style="{ height: heightOf(dayTotal(day)) }">
                <span
                  class="chart__part chart__part--challenge"
                  :style="{ height: heightOf(day.challenge_tasks) }"
                />
                <span
                  class="chart__part chart__part--habit"
                  :style="{ height: heightOf(day.habit_checkins) }"
                />
              </span>
              <span class="chart__label">{{ showLabel(index) ? dayLabel(day.date) : '' }}</span>
            </li>
          </ul>

          <ul class="legend">
            <li><span class="legend__dot legend__dot--tasks" />{{ t('analytics.legendTasks') }}</li>
            <li><span class="legend__dot legend__dot--challenge" />{{ t('analytics.legendChallenge') }}</li>
            <li><span class="legend__dot legend__dot--habit" />{{ t('analytics.legendHabits') }}</li>
          </ul>
        </section>

        <section v-if="rooms.length" class="card">
          <h2 class="card__title">{{ t('analytics.rooms') }}</h2>
          <ul class="rows">
            <li v-for="room in rooms" :key="room.room" class="row">
              <span class="row__name">{{ room.room }}</span>
              <span class="row__bar">
                <span
                  class="row__fill"
                  :style="{ width: `${Math.round((room.done / rooms[0]!.done) * 100)}%` }"
                />
              </span>
              <span class="row__value">{{ room.done }}</span>
            </li>
          </ul>
        </section>

        <section v-if="habits.length" class="card">
          <h2 class="card__title">{{ t('analytics.topHabits') }}</h2>
          <ul class="rows">
            <li v-for="habit in habits" :key="habit.title" class="row row--habit">
              <span class="row__icon" aria-hidden="true"><i :class="['pi', habit.icon ?? 'pi-check']" /></span>
              <span class="row__name">{{ habit.title }}</span>
              <span class="row__value">{{ habit.done }}</span>
            </li>
          </ul>

          <NuxtLink :to="localePath('/habits')" class="link">{{ t('nav.habits') }} →</NuxtLink>
        </section>
      </template>

      <AppButton v-if="!auth.isAuthenticated" variant="filled" block :to="localePath('/login')">
        {{ t('auth.login') }}
      </AppButton>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.page__title {
  font-size: var(--fs-display);
}

.hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.hint--error {
  color: var(--c-danger);
}

.totals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-3);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
}

.stat__value {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.1;
}

.stat__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.card__title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.chart {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 140px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chart__day {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  flex: 1;
  height: 100%;
  min-width: 0;
}

.chart__bar {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  width: 100%;
  max-width: 22px;
  min-height: 2px;
  border-radius: 4px;
  background: var(--c-brand);
  overflow: hidden;
}

.chart__part {
  display: block;
  width: 100%;
}

.chart__part--challenge {
  background: var(--c-amber);
}

.chart__part--habit {
  background: var(--c-accent);
}

.chart__label {
  height: 14px;
  color: var(--c-text-muted);
  font-size: 0.5625rem;
  white-space: nowrap;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend__dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.legend__dot--tasks {
  background: var(--c-brand);
}

.legend__dot--challenge {
  background: var(--c-amber);
}

.legend__dot--habit {
  background: var(--c-accent);
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.row__name {
  flex: 0 0 40%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__bar {
  flex: 1;
  height: 8px;
  border-radius: var(--r-pill);
  background: var(--c-track);
  overflow: hidden;
}

.row__fill {
  display: block;
  height: 100%;
  border-radius: var(--r-pill);
  background: var(--c-brand);
}

.row__value {
  flex: 0 0 3ch;
  text-align: right;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.row__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: var(--r-chip);
  background: var(--c-surface-mint);
  color: var(--c-brand);
}

.row--habit .row__name {
  flex: 1;
}

.link {
  align-self: flex-start;
  color: var(--c-brand);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}
</style>
