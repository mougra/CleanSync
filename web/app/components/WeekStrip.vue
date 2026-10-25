<script setup lang="ts">
import type { CalendarResponse } from '~/types/task';

/**
 * Компактная календарная полоса недели: месяц/год со стрелками листания и семь
 * чисел, где сегодняшний день обведён кружком.
 *
 * Календарь — это навигация по дням: клик по числу выбирает день, и карточка
 * плана на главной показывает план именно этого дня. Отмечать можно любой день
 * (решает карточка плана), а вокруг числа рисуется кольцо прогресса — по нему
 * видно, где план закрыт, не открывая день.
 *
 * Окно едет за выбором: клик по крайнему числу подкручивает полосу на сутки, а
 * не на неделю. Шаг в семь дней перепрыгивал бы шесть чисел, до которых человек
 * как раз и хотел дойти: выбранный день остаётся выбранным, а рядом появляется
 * следующий (или предыдущий) — и по нему можно кликнуть так же, пока не дойдёшь
 * до нужной даты. Стрелки по-прежнему листают неделями: это «далеко», крайние
 * числа — «на шаг».
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
    const weekday = date.getDay();
    return {
      iso: toISODate(date),
      date,
      dayNumber: date.getDate(),
      // Выходные считаем по самой дате, а не по позиции в полосе: окно ездит
      // по дням, и «первая и последняя клетка» перестали быть субботой
      // с воскресеньем.
      isWeekend: weekday === 0 || weekday === 6,
    };
  }),
);

const todayISO = computed(() => toISODate(new Date()));

/**
 * Прогресс дней полосы: по кольцу вокруг числа видно, где план закрыт, а где нет.
 *
 * Данные берём у сервера (`GET /api/tasks/calendar`) на весь видимый диапазон
 * одним запросом: он же отдаёт итоги дня для карточки плана, поэтому второго
 * источника правды не появляется. Ключ включает начало полосы — при листании
 * недель данные перезапрашиваются.
 *
 * У гостя плана нет, поэтому запрос не уходит вовсе.
 */
const auth = useAuthStore();
const api = useApi();

const range = computed(() => ({
  from: days.value[0]?.iso ?? weekStart.value,
  to: days.value[days.value.length - 1]?.iso ?? weekStart.value,
}));

const { data: weekData } = await useAsyncData(
  () => `calendar-week-${range.value.from}`,
  () =>
    auth.isAuthenticated
      ? api.request<CalendarResponse>(
          `/api/tasks/calendar?from=${range.value.from}&to=${range.value.to}`,
        )
      : Promise.resolve(null),
  { watch: [() => range.value.from] },
);

/** Доля закрытых дел дня: `null` — дел нет, кольцо не рисуем. */
const dayPercent = (iso: string): number | null => {
  const day = weekData.value?.days.find((entry) => entry.date === iso);

  if (!day || day.total_tasks === 0) {
    return null;
  }

  return Math.round((day.completed_tasks / day.total_tasks) * 100);
};

/** Длина окружности кольца: радиус 16 в системе координат 36×36. */
const RING_LENGTH = 2 * Math.PI * 16;

const ringDash = (percent: number) => `${(RING_LENGTH * percent) / 100} ${RING_LENGTH}`;

/** Цвет кольца по доле: пусто — приглушённый, половина — бренд, всё — акцент. */
const ringTone = (percent: number): string => {
  if (percent >= 100) return 'week-strip__ring--full';
  if (percent >= 50) return 'week-strip__ring--mid';

  return 'week-strip__ring--low';
};

/**
 * «октябрь 2026» — месяц и год одной строкой без предлога, как в макетах.
 *
 * Если окно захватывает два месяца, показываем оба: иначе числа вроде «1» и «2»
 * в конце полосы читались бы без месяца. При сдвиге на сутки это обычное дело.
 */
const monthTitle = computed(() => {
  const from = start.value;
  const to = addDays(from, 6);
  const monthYear = (date: Date) =>
    new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric' }).format(date);

  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return monthYear(from);
  }

  const monthOnly = (date: Date) =>
    new Intl.DateTimeFormat(locale.value, { month: 'long' }).format(date);

  return from.getFullYear() === to.getFullYear()
    ? `${monthOnly(from)} — ${monthYear(to)}`
    : `${monthYear(from)} — ${monthYear(to)}`;
});

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

/**
 * Выбор дня: карточка плана на главной перечитывает выбранный день.
 *
 * Крайнее число — это ещё и шаг: человек, дошедший до края полосы, хочет
 * следующий день, а не следующую неделю. Выбранный день остаётся выбранным,
 * а окно подкручивается на сутки, открывая соседний — по нему можно кликнуть
 * так же и идти дальше по одному дню.
 */
const selectDay = (iso: string) => {
  selectedDate.value = iso;

  const first = days.value[0]?.iso;
  const last = days.value[days.value.length - 1]?.iso;

  if (iso === last) {
    weekStart.value = toISODate(addDays(start.value, 1));
  } else if (iso === first) {
    weekStart.value = toISODate(addDays(start.value, -1));
  }
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

      <!--
        Месяц — подпись календаря, а не заголовок страницы: H1 живёт на главной
        (pages/index.vue) и рассказывает про продукт. Здесь раньше стоял `h1`,
        и в разметке главной единственным заголовком первого уровня оказывалось
        «октябрь 2026 г.».
      -->
      <p class="week-strip__title">{{ monthTitle }}</p>

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

          <span class="week-strip__number">
            <!--
              Кольцо прогресса вокруг числа: его видно, не открывая день, и по
              цвету понятно, закрыт план или нет. `aria-hidden` — у кнопки уже
              есть подпись с полной датой.
            -->
            <svg
              v-if="dayPercent(day.iso) !== null"
              class="week-strip__ring"
              :class="ringTone(dayPercent(day.iso) as number)"
              viewBox="0 0 36 36"
              aria-hidden="true"
            >
              <circle class="week-strip__ring-track" cx="18" cy="18" r="16" />
              <circle
                class="week-strip__ring-fill"
                cx="18"
                cy="18"
                r="16"
                :stroke-dasharray="ringDash(dayPercent(day.iso) as number)"
              />
            </svg>

            {{ day.dayNumber }}
          </span>
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
  /* Отступ между подписью дня недели и числом: без него они слипались в строку */
  gap: 3px;
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
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-pill);
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1;
}

/*
 * Кольцо прогресса: чуть больше числа и повёрнуто на -90°, чтобы заполнение
 * начиналось сверху. Линия тонкая (2 px): на 28-пиксельном кружке толще —
 * значит спорить с цифрой.
 */
.week-strip__ring {
  position: absolute;
  inset: -4px;
  width: 36px;
  height: 36px;
  transform: rotate(-90deg);
  overflow: visible;
  pointer-events: none;
}

.week-strip__ring-track,
.week-strip__ring-fill {
  fill: none;
  stroke-width: 2;
}

.week-strip__ring-track {
  stroke: var(--c-border);
}

.week-strip__ring-fill {
  stroke-linecap: round;
  transition: stroke-dasharray var(--dur-base) var(--ease-out);
}

.week-strip__ring--low .week-strip__ring-fill {
  stroke: var(--c-text-muted);
}

.week-strip__ring--mid .week-strip__ring-fill {
  stroke: var(--c-brand);
}

.week-strip__ring--full .week-strip__ring-fill {
  stroke: var(--c-accent);
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
