<script setup lang="ts">
/**
 * Компактная календарная полоса недели: месяц/год со стрелками листания и семь
 * чисел, где сегодняшний день обведён кружком.
 *
 * Календарь — это навигация по дням: клик по числу выбирает день, и карточка
 * плана на главной показывает план именно этого дня. Отметки при этом доступны
 * только для сегодняшнего дня — решает это карточка плана, а не календарь.
 *
 * Высота намеренно небольшая: полоса стоит над содержимым на каждом «дневном»
 * экране, поэтому из макета взяты только месяц, числа и кружок. Подписи дней
 * недели остались сокращёнными — по ним видно, где выходные.
 */
const { t, locale } = useI18n();

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

/** «октябрь 2025» — месяц и год одной строкой без предлога, как в макетах. */
const monthTitle = computed(() =>
  new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric' }).format(start.value),
);

const weekdayLabel = (date: Date) =>
  new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(date).toUpperCase();

/** Доступное имя числа: в озвучке «13» без дня недели не читается. */
const dayLabel = (date: Date) =>
  new Intl.DateTimeFormat(locale.value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);

const shiftWeek = (delta: number) => {
  weekStart.value = toISODate(addDays(start.value, delta * 7));
};

/** Выбор дня: карточка плана на главной перечитывает выбранный день. */
const selectDay = (iso: string) => {
  selectedDate.value = iso;
};
</script>

<template>
  <header class="week-strip">
    <div class="week-strip__row">
      <button
        type="button"
        class="week-strip__arrow"
        :aria-label="t('calendar.prevWeek')"
        @click="shiftWeek(-1)"
      >
        <i class="pi pi-chevron-left" aria-hidden="true" />
      </button>

      <h1 class="week-strip__title">{{ monthTitle }}</h1>

      <button
        type="button"
        class="week-strip__arrow"
        :aria-label="t('calendar.nextWeek')"
        @click="shiftWeek(1)"
      >
        <i class="pi pi-chevron-right" aria-hidden="true" />
      </button>
    </div>

    <ul class="week-strip__days">
      <li v-for="day in days" :key="day.iso" class="week-strip__cell">
        <button
          type="button"
          class="week-strip__day"
          :class="{
            'week-strip__day--today': day.iso === todayISO,
            'week-strip__day--selected': day.iso === selectedDate,
            'week-strip__day--weekend': day.isWeekend,
          }"
          :aria-current="day.iso === todayISO ? 'date' : undefined"
          :aria-label="dayLabel(day.date)"
          :aria-pressed="day.iso === selectedDate"
          @click="selectDay(day.iso)"
        >
          <span class="week-strip__weekday" aria-hidden="true">{{ weekdayLabel(day.date) }}</span>
          <span class="week-strip__number">{{ day.dayNumber }}</span>
        </button>
      </li>
    </ul>
  </header>
</template>

<style scoped>
.week-strip {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  /*
   * Календарь уже страницы и стоит по центру: семь чисел не нуждаются в полосе
   * во всю ширину, а рядом с широкой карточкой плана он выглядел растянутым.
   */
  width: 100%;
  max-width: var(--content-narrow);
  margin-inline: auto;
  padding: 0;
}

.week-strip__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.week-strip__title {
  flex: 1;
  overflow: hidden;
  margin: 0;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Стрелки — квадрат по минимальной зоне нажатия: полоса из-за них не растёт. */
.week-strip__arrow {
  flex: 0 0 var(--tap-min);
  width: var(--tap-min);
  height: var(--tap-min);
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out);
}

.week-strip__arrow:hover {
  background: var(--c-surface-sunken);
  color: var(--c-text);
}

.week-strip__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.week-strip__cell {
  display: flex;
  justify-content: center;
  min-width: 0;
}

.week-strip__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  /* Кружок не должен упираться в края ячейки на узком экране */
  padding: 2px var(--space-1);
  border: 1.5px solid transparent;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text);
  cursor: pointer;
  font: inherit;
}

.week-strip__weekday {
  font-size: 0.625rem;
  line-height: 1.2;
  color: var(--c-text-muted);
}

.week-strip__number {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-pill);
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1;
}

.week-strip__day--weekend .week-strip__number {
  color: var(--c-accent);
}

/* Сегодня — кружок вокруг числа: заливка акцентом, ровные ширина и высота. */
.week-strip__day--today .week-strip__number {
  background: var(--c-accent);
  color: var(--c-onbrand);
}

/* Выбранный день: обводка той же формы, что и кружок. */
.week-strip__day--selected .week-strip__number {
  border: 1.5px solid var(--c-accent);
  background: var(--c-surface);
}

/* Сегодня выбран — заливка важнее обводки, иначе кружок выглядел бы пустым. */
.week-strip__day--today.week-strip__day--selected .week-strip__number {
  background: var(--c-accent);
  color: var(--c-onbrand);
}

.week-strip__day:focus-visible {
  outline: 2px solid var(--c-brand);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .week-strip__arrow {
    transition: none;
  }
}
</style>
