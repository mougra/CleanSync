<script setup lang="ts">
/**
 * График привычек за последние 7 дней (макет «привычки 3», блок «Последние 7 дней»).
 * Каждый день — клетка: пустая (привычек ещё не было), пропуск, частично
 * отмечено или всё закрыто. Сегодняшний день выделен рамкой.
 */
import type { HabitWeekDay } from '~/types/habit';

const props = defineProps<{ days: HabitWeekDay[]; today?: string }>();

const { t, locale } = useI18n();

const weekdayLabel = (date: string) =>
  new Intl.DateTimeFormat(locale.value, { weekday: 'short' })
    .format(fromISODate(date))
    .toUpperCase();

const activeDays = computed(() => props.days.filter((day) => day.done > 0).length);

const summary = computed(() => {
  const total = props.days.length;
  const unit =
    locale.value === 'ru'
      ? pluralRu(total, t('habits.day_one'), t('habits.day_few'), t('habits.day_many'))
      : total === 1
        ? t('habits.day_one')
        : t('habits.day_many');

  return t('habits.weekSummary', { done: activeDays.value, total, unit });
});

const cellState = (day: HabitWeekDay) => {
  if (day.total === 0) {
    return 'future';
  }
  if (day.done === 0) {
    return 'missed';
  }
  return day.done >= day.total ? 'full' : 'partial';
};
</script>

<template>
  <section class="week">
    <header class="week__head">
      <h2 class="week__title">{{ t('habits.last7days') }}</h2>
      <span class="week__summary">{{ summary }}</span>
    </header>

    <ol class="week__grid">
      <li
        v-for="day in days"
        :key="day.date"
        class="cell"
        :class="[`cell--${cellState(day)}`, { 'cell--today': day.date === today }]"
      >
        <span class="cell__weekday">{{ weekdayLabel(day.date) }}</span>
        <span class="cell__number">{{ fromISODate(day.date).getDate() }}</span>
        <span
          class="cell__dot"
          :aria-label="`${day.done} / ${day.total}`"
        />
      </li>
    </ol>
  </section>
</template>

<style scoped>
.week {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.week__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.week__title {
  font-size: 1.125rem;
}

.week__summary {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.week__grid {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--space-2);
}

.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--space-2) 0;
  border: 1px solid transparent;
  border-radius: var(--r-chip);
  background: var(--c-surface);
}

.cell__weekday {
  color: var(--c-text-muted);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.cell__number {
  font-size: var(--fs-caption);
  font-weight: 600;
}

.cell__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--r-pill);
  background: var(--c-track);
}

/* Привычек в тот день ещё не было — нейтрально и без точки */
.cell--future {
  background: transparent;
}

.cell--future .cell__number {
  color: var(--c-text-muted);
}

/* Пропуск: точка цвета трека, клетка как обычно */
.cell--missed .cell__dot {
  background: var(--c-track);
}

/* Частично закрыт */
.cell--partial {
  background: var(--c-surface-warm);
}

.cell--partial .cell__dot {
  background: var(--c-amber);
}

/* Всё закрыто */
.cell--full {
  background: var(--c-surface-mint);
}

.cell--full .cell__dot {
  background: var(--c-brand);
}

.cell--today {
  border-color: var(--c-brand);
}
</style>
