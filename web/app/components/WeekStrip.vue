<script setup lang="ts">
/**
 * Календарная полоса недели из макетов главной: месяц/год, 7 дней, активный день
 * обведён, выходные приглушены, стрелки листают недели.
 *
 * Выбранная дата живёт в общем состоянии, чтобы страницы «Сегодня», «Привычки»
 * и чек-листы работали с одним и тем же днём.
 */
const { locale } = useI18n();

const selectedDate = useState<string>('selected-date', () => toISODate(new Date()));
const weekStart = useState<string>('week-start', () => toISODate(startOfWeek(new Date())));

// Серверная отрисовка может знать другую дату, чем браузер пользователя:
// после гидратации подтягиваем локальный день без ошибок гидратации.
onMounted(() => {
  const today = new Date();
  selectedDate.value = toISODate(today);
  weekStart.value = toISODate(startOfWeek(today));
});

const start = computed(() => fromISODate(weekStart.value));
const days = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start.value, index);
    return { iso: toISODate(date), date, dayNumber: date.getDate(), isWeekend: index === 0 || index === 6 };
  }),
);

const todayISO = computed(() => toISODate(new Date()));

const monthTitle = computed(() => {
  const parts = new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric' }).formatToParts(
    start.value,
  );
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  return `${month} ${year}`.trim();
});

const weekdayLabel = (date: Date) =>
  new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(date).toUpperCase();

const shiftWeek = (delta: number) => {
  weekStart.value = toISODate(addDays(start.value, delta * 7));
};

const selectDay = (iso: string) => {
  selectedDate.value = iso;
};
</script>

<template>
  <header class="week-strip">
    <h1 class="week-strip__title">{{ monthTitle }}</h1>

    <div class="week-strip__row">
      <button
        type="button"
        class="week-strip__arrow"
        aria-label="Предыдущая неделя"
        @click="shiftWeek(-1)"
      >
        <i class="pi pi-chevron-left" aria-hidden="true" />
      </button>

      <ul class="week-strip__days">
        <li v-for="day in days" :key="day.iso">
          <button
            type="button"
            class="week-strip__day"
            :class="{
              'week-strip__day--today': day.iso === todayISO,
              'week-strip__day--selected': day.iso === selectedDate,
              'week-strip__day--weekend': day.isWeekend,
            }"
            :aria-current="day.iso === selectedDate ? 'date' : undefined"
            @click="selectDay(day.iso)"
          >
            <span class="week-strip__weekday">{{ weekdayLabel(day.date) }}</span>
            <span class="week-strip__number">{{ day.dayNumber }}</span>
          </button>
        </li>
      </ul>

      <button type="button" class="week-strip__arrow" aria-label="Следующая неделя" @click="shiftWeek(1)">
        <i class="pi pi-chevron-right" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.week-strip {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) 0 var(--space-2);
}

.week-strip__title {
  text-align: center;
  font-size: var(--fs-title);
  font-weight: 700;
}

.week-strip__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.week-strip__arrow {
  flex: 0 0 var(--tap-min);
  width: var(--tap-min);
  height: var(--tap-min);
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text);
  cursor: pointer;
}

.week-strip__arrow:hover {
  background: var(--c-surface-sunken);
}

.week-strip__days {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.week-strip__day {
  width: 100%;
  min-height: var(--tap-min);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 1.5px solid transparent;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text);
  cursor: pointer;
  padding: var(--space-1) 0;
}

.week-strip__weekday {
  font-size: 0.6875rem;
  color: var(--c-text-muted);
}

.week-strip__number {
  font-size: 1rem;
  font-weight: 600;
}

.week-strip__day--weekend {
  opacity: 0.55;
}

.week-strip__day--today .week-strip__number {
  color: var(--c-accent);
}

.week-strip__day--selected {
  border-color: var(--c-accent);
  background: var(--c-surface);
}
</style>
