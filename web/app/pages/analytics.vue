<script setup lang="ts">
/**
 * Статистика: периоды, распределение по дням недели, время и история уборки.
 *
 * Данные приходят из `/api/analytics/overview`: суммы считает сервер, поэтому
 * числа здесь и на главной совпадают. История ограничена тремя сотнями записей —
 * поиск и группировка по дням идут на клиенте.
 */
import type { StatsPeriod } from '~/types/stats';

const { t, locale } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();

const period = ref<StatsPeriod>('all');
const query = ref('');

const { overview, historyByDay } = await useStats(period);

const periods: Array<{ value: StatsPeriod; label: string }> = [
  { value: 'week', label: 'analytics.periodWeek' },
  { value: 'month', label: 'analytics.periodMonth' },
  { value: 'all', label: 'analytics.periodAll' },
];

/** Русскому нужны три формы числительного, английскому — две. */
const plural = (count: number, one: string, few: string, many: string) =>
  locale.value === 'ru' ? pluralRu(count, one, few, many) : pluralEn(count, one, many);

const weekdayLabels = computed(() =>
  Array.from({ length: 7 }, (_, index) =>
    // 7 января 2024 — воскресенье: неделя в макетах начинается с него
    new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(
      new Date(2024, 0, 7 + index),
    ),
  ),
);

const glanceLabel = computed(() => {
  const suffix = period.value === 'week' ? 'Week' : period.value === 'month' ? 'Month' : 'All';

  return t(`analytics.glance${suffix}`);
});

const doneWord = computed(() =>
  plural(
    overview.value?.totals.tasks ?? 0,
    t('analytics.doneOne'),
    t('analytics.doneFew'),
    t('analytics.doneMany'),
  ),
);

const maxWeekdayTasks = computed(() =>
  Math.max(1, ...(overview.value?.weekday ?? []).map((day) => day.tasks)),
);

const busiestLabel = computed(() => {
  const index = overview.value?.busiestWeekday;

  if (index === null || index === undefined) {
    return '';
  }

  const tasks = overview.value?.weekday[index]?.tasks ?? 0;

  return `${weekdayLabels.value[index]} · ${tasks} ${plural(
    tasks,
    t('analytics.taskOne'),
    t('analytics.taskFew'),
    t('analytics.taskMany'),
  )}`;
});

const historyPeriodLabel = computed(() => {
  const suffix = period.value === 'week' ? 'Week' : period.value === 'month' ? 'Month' : 'All';

  return t(`analytics.historyPeriod${suffix}`);
});

const daysBadge = computed(() => {
  const days = overview.value?.totals.days ?? 0;

  return `${days} ${plural(days, t('analytics.daysOne'), t('analytics.daysFew'), t('analytics.daysMany'))}`;
});

/** Поиск по названию: фильтруем уже сгруппированную историю. */
const filteredHistory = computed(() => {
  const needle = query.value.trim().toLowerCase();

  if (!needle) {
    return historyByDay.value;
  }

  return historyByDay.value
    .map((group) => ({
      date: group.date,
      items: group.items.filter((item) => item.title.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.items.length > 0);
});

const formatDay = (iso: string) =>
  new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    fromISODate(iso),
  );

useSeoMeta({ title: () => t('analytics.title'), robots: 'noindex, nofollow' });
</script>

<template>
  <div class="stats">
    <header class="stats__head">
      <NuxtLink :to="localePath('/')" class="stats__back" :aria-label="t('error.home')">
        <i class="pi pi-arrow-left" aria-hidden="true" />
      </NuxtLink>
      <h1 class="stats__title">{{ t('analytics.title') }}</h1>
    </header>

    <p v-if="!auth.isAuthenticated" class="stats__hint">{{ t('analytics.signIn') }}</p>

    <template v-else>
      <!-- Периоды: неделя, месяц, за всё время -->
      <div class="segments" role="tablist">
        <button
          v-for="item in periods"
          :key="item.value"
          type="button"
          role="tab"
          class="segments__item"
          :class="{ 'segments__item--active': period === item.value }"
          :aria-selected="period === item.value"
          @click="period = item.value"
        >
          {{ t(item.label) }}
        </button>
      </div>

      <template v-if="overview">
        <!-- Главная карточка периода -->
        <section class="card card--warm glance">
          <AppBadge variant="amber">{{ glanceLabel }}</AppBadge>

          <div class="glance__top">
            <p class="glance__value">{{ overview.totals.tasks }}</p>
            <span class="glance__icon" aria-hidden="true"><i class="pi pi-chart-bar" /></span>
          </div>

          <p class="glance__line">
            {{ overview.totals.tasks }} {{ doneWord }} · {{ formatClock(overview.totals.minutes) }}
          </p>

          <ul class="bars" role="img" :aria-label="t('analytics.activity')">
            <li v-for="day in overview.weekday" :key="day.weekday" class="bars__item">
              <span
                class="bars__bar"
                :class="{ 'bars__bar--busy': day.weekday === overview.busiestWeekday && day.tasks > 0 }"
                :style="{ height: `${Math.max(8, (day.tasks / maxWeekdayTasks) * 100)}%` }"
                :title="`${weekdayLabels[day.weekday]}: ${day.tasks}`"
              />
              <span class="bars__label">{{ weekdayLabels[day.weekday] }}</span>
            </li>
          </ul>

          <div v-if="busiestLabel" class="glance__footer">
            <span>{{ t('analytics.busiest') }}</span>
            <strong>{{ busiestLabel }}</strong>
          </div>
        </section>

        <!-- Последние 7 дней и затраченное время -->
        <div class="pair">
          <section class="card card--mint tile">
            <span class="tile__icon" aria-hidden="true"><i class="pi pi-check" /></span>
            <p class="tile__title">{{ t('analytics.last7Title') }}</p>
            <p class="tile__value">{{ overview.last7.tasks }}</p>
            <p class="tile__hint">{{ t('analytics.last7Hint') }}</p>
          </section>

          <section class="card card--warm tile">
            <span class="tile__icon" aria-hidden="true"><i class="pi pi-clock" /></span>
            <p class="tile__title">{{ t('analytics.timeTitle') }}</p>
            <p class="tile__value tile__value--time">{{ formatClock(overview.totals.minutes) }}</p>
            <p class="tile__hint">{{ t('analytics.timeHint') }}</p>
          </section>
        </div>

        <!-- Самая долгая задача -->
        <section class="card card--mint longest">
          <span class="tile__icon" aria-hidden="true"><i class="pi pi-chart-bar" /></span>
          <p class="tile__title">{{ t('analytics.longestTitle') }}</p>
          <p v-if="overview.longest" class="longest__name">{{ overview.longest.title }}</p>
          <p v-if="overview.longest" class="longest__time">{{ formatClock(overview.longest.minutes) }}</p>
          <p v-else class="tile__hint">{{ t('analytics.longestEmpty') }}</p>
        </section>

        <!-- История уборки -->
        <section class="card">
          <header class="history__head">
            <div>
              <h2 class="card__title">{{ t('analytics.historyTitle') }}</h2>
              <p class="tile__hint">{{ t('analytics.historyHint', { period: historyPeriodLabel }) }}</p>
            </div>
            <AppBadge variant="amber">{{ daysBadge }}</AppBadge>
          </header>

          <label class="search">
            <i class="pi pi-search" aria-hidden="true" />
            <input v-model="query" class="search__input" type="search" :placeholder="t('analytics.search')" >
          </label>

          <ol v-if="filteredHistory.length" class="timeline">
            <li v-for="group in filteredHistory" :key="group.date" class="timeline__day">
              <div class="timeline__marker" aria-hidden="true" />

              <div class="day">
                <header class="day__head">
                  <p class="day__date">{{ formatDay(group.date) }}</p>
                  <AppBadge variant="amber">
                    {{ group.items.length }}
                    {{ plural(group.items.length, t('analytics.taskOne'), t('analytics.taskFew'), t('analytics.taskMany')) }}
                  </AppBadge>
                </header>

                <ul class="day__items">
                  <li v-for="(item, index) in group.items" :key="`${item.title}-${index}`" class="item">
                    <span class="item__check" aria-hidden="true"><i class="pi pi-check" /></span>
                    <span class="item__title">{{ item.title }}</span>
                    <span v-if="item.minutes" class="item__time">{{ formatClockShort(item.minutes) }}</span>
                  </li>
                </ul>
              </div>
            </li>
          </ol>

          <p v-else class="tile__hint">
            {{ query ? t('analytics.noResults') : t('analytics.empty') }}
          </p>
        </section>
      </template>

      <p v-else class="stats__hint">{{ t('state.loading') }}</p>
    </template>
  </div>
</template>

<style scoped>
.stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-bottom: var(--space-5);
}

.stats__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.stats__back {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  border-radius: var(--r-pill);
  color: var(--c-text);
  text-decoration: none;
}

.stats__back:hover {
  background: var(--c-surface-sunken);
}

.stats__title {
  font-size: var(--fs-display);
}

.stats__hint {
  color: var(--c-text-muted);
}

/* Периоды */
.segments {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-1);
  padding: var(--space-1);
  border: 1px solid var(--c-border);
  border-radius: var(--r-chip);
  background: var(--c-surface);
}

.segments__item {
  min-height: 44px;
  border: none;
  border-radius: var(--r-chip);
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  cursor: pointer;
}

.segments__item--active {
  color: var(--c-text);
  font-weight: 600;
}

/* Главная карточка периода */
.glance {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.glance__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.glance__value {
  font-size: 56px;
  font-weight: 700;
  line-height: 1;
}

.glance__icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-brand);
  font-size: 1.5rem;
}

.glance__line {
  color: var(--c-text-muted);
}

.bars {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  align-items: end;
  gap: var(--space-2);
  height: 96px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bars__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
  height: 100%;
}

.bars__bar {
  width: 100%;
  max-width: 34px;
  border-radius: 999px;
  background: var(--c-border);
}

.bars__bar--busy {
  background: var(--c-brand);
}

.bars__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.glance__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface);
  font-size: var(--fs-caption);
}

/* Плитки */
.pair {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

.tile {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tile__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-brand);
}

.tile__title {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.tile__value {
  font-size: var(--fs-title);
  font-weight: 700;
}

.tile__value--time {
  font-size: 28px;
}

.tile__hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.longest__name {
  font-size: var(--fs-body);
  font-weight: 600;
}

.longest__time {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

/* История */
.history__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  color: var(--c-text-muted);
}

.search__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--c-text);
  font: inherit;
  outline: none;
}

.timeline {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: var(--space-4) 0 0;
  padding: 0 0 0 var(--space-4);
  list-style: none;
}

.timeline::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 5px;
  width: 2px;
  background: var(--c-surface-mint);
}

.timeline__day {
  position: relative;
}

.timeline__marker {
  position: absolute;
  top: var(--space-5);
  left: calc(-1 * var(--space-4) + 1px);
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--c-brand);
}

.day {
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
  box-shadow: 0 2px 10px rgb(0 0 0 / 4%);
}

.day__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.day__date {
  font-weight: 600;
}

.day__items {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface-sunken);
  font-size: var(--fs-caption);
}

.item__check {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border-radius: 999px;
  background: var(--c-surface-mint);
  color: var(--c-brand);
  font-size: 0.7rem;
}

.item__title {
  flex: 1;
  min-width: 0;
}

.item__time {
  padding: 2px var(--space-2);
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-text-muted);
}

@media (max-width: 420px) {
  .pair {
    grid-template-columns: 1fr;
  }
}
</style>
