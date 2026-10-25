<script setup lang="ts">
/**
 * Поле выбора даты в дизайне сайта.
 *
 * Зачем своё, если есть `<input type="date">`: системный календарь на iOS и
 * Android рисует свой шрифт, свои цвета и свою сетку — он единственный элемент
 * формы, который выпадал из дизайн-системы, а на десктопе в Firefox выглядел
 * как три спиннера. Здесь тот же набор токенов, что у остальных полей, и
 * быстрые ответы («Сегодня», «Завтра», «Через неделю»), до которых в системном
 * календаре надо было дойти пальцем.
 *
 * Значение — строка `YYYY-MM-DD` (как у `input[type=date]` и как `due_date` в
 * API), пустая строка означает «дата не выбрана». Пустое значение осмысленно:
 * у задачи с интервалом больше суток сервер сам подставит сегодняшний день как
 * опору цикла (правило 33), и трогать поле не обязательно.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    /** Подпись строки: «Срок выполнения», «Дедлайн» и т. п. */
    label: string;
    /** Доступное имя: у строки с подписью оно всё равно нужно для скринридера. */
    ariaLabel?: string;
    /** Разрешить очистку даты (у привычек дата обязательна). */
    clearable?: boolean;
  }>(),
  { ariaLabel: '', clearable: true },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { t, locale } = useI18n();

/** Короткие дни недели: сетка начинается с понедельника, как в календаре. */
const weekdays = computed(() =>
  locale.value === 'en'
    ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
    : ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
);

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const pad = (value: number) => String(value).padStart(2, '0');

const toIso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parse = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date;
};

const today = new Date();
today.setHours(0, 0, 0, 0);

const selected = computed(() => parse(props.modelValue));

/** Месяц, который открыт в календаре: при открытии — месяц выбранной даты. */
const cursor = ref(new Date(today.getFullYear(), today.getMonth(), 1));

watch(open, (isOpen) => {
  if (!isOpen) return;

  const base = selected.value ?? today;
  cursor.value = new Date(base.getFullYear(), base.getMonth(), 1);
});

const monthTitle = computed(() =>
  new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(cursor.value),
);

const valueLabel = computed(() => {
  const date = selected.value;

  if (!date) {
    return t('dateField.empty');
  }

  return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(date);
});

/**
 * Дни месяца в виде сетки с пустыми клетками до понедельника.
 * `null` — пустая клетка: так первый ряд выравнивается по дню недели.
 */
const cells = computed<Array<{ iso: string; day: number } | null>>(() => {
  const year = cursor.value.getFullYear();
  const month = cursor.value.getMonth();
  const first = new Date(year, month, 1);
  // getDay(): 0 — воскресенье, а сетка начинается с понедельника.
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const result: Array<{ iso: string; day: number } | null> = Array.from(
    { length: offset },
    () => null,
  );

  for (let day = 1; day <= daysInMonth; day += 1) {
    result.push({ iso: toIso(new Date(year, month, day)), day });
  }

  return result;
});

const shiftMonth = (delta: number) => {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1);
};

const choose = (iso: string) => {
  emit('update:modelValue', iso);
  open.value = false;
};

const pickRelative = (days: number) => {
  const date = new Date(today);

  date.setDate(date.getDate() + days);
  choose(toIso(date));
};

const clear = () => {
  emit('update:modelValue', '');
  open.value = false;
};

const isSelected = (iso: string) => props.modelValue === iso;
const isToday = (iso: string) => toIso(today) === iso;

/** Клик мимо и Escape закрывают календарь: он не должен «залипать». */
const onDocumentClick = (event: MouseEvent) => {
  if (!open.value) return;

  if (root.value && !root.value.contains(event.target as Node)) {
    open.value = false;
  }
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && open.value) {
    open.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div ref="root" class="date-field">
    <button
      type="button"
      class="date-field__button"
      :aria-label="ariaLabel || label"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="open = !open"
    >
      <span class="date-field__icon" aria-hidden="true"><i class="pi pi-calendar" /></span>
      <span class="date-field__label">{{ label }}</span>
      <span class="date-field__value" :class="{ 'date-field__value--empty': !selected }">
        {{ valueLabel }}
      </span>
    </button>

    <Transition name="pop">
      <div v-if="open" class="popover" role="dialog" :aria-label="label">
        <header class="popover__head">
          <button
            type="button"
            class="popover__arrow"
            :aria-label="t('dateField.previousMonth')"
            @click="shiftMonth(-1)"
          >
            <i class="pi pi-chevron-left" aria-hidden="true" />
          </button>
          <span class="popover__month">{{ monthTitle }}</span>
          <button
            type="button"
            class="popover__arrow"
            :aria-label="t('dateField.nextMonth')"
            @click="shiftMonth(1)"
          >
            <i class="pi pi-chevron-right" aria-hidden="true" />
          </button>
        </header>

        <div class="popover__weekdays" aria-hidden="true">
          <span v-for="day in weekdays" :key="day">{{ day }}</span>
        </div>

        <div class="popover__grid">
          <template v-for="(cell, index) in cells" :key="cell?.iso ?? `empty-${index}`">
            <span v-if="!cell" class="popover__empty" />
            <button
              v-else
              type="button"
              class="popover__day"
              :class="{
                'popover__day--selected': isSelected(cell.iso),
                'popover__day--today': isToday(cell.iso) && !isSelected(cell.iso),
              }"
              :aria-pressed="isSelected(cell.iso)"
              @click="choose(cell.iso)"
            >
              {{ cell.day }}
            </button>
          </template>
        </div>

        <div class="popover__quick">
          <button type="button" class="quick" @click="pickRelative(0)">
            {{ t('dateField.today') }}
          </button>
          <button type="button" class="quick" @click="pickRelative(1)">
            {{ t('dateField.tomorrow') }}
          </button>
          <button type="button" class="quick" @click="pickRelative(7)">
            {{ t('dateField.nextWeek') }}
          </button>
          <button v-if="clearable" type="button" class="quick quick--muted" @click="clear">
            {{ t('dateField.clear') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.date-field {
  position: relative;
  min-width: 0;
}

/* Строка повторяет `.row` из шторок: иконка, подпись, значение справа. */
.date-field__button {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: var(--tap-min);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--c-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.date-field__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: var(--r-pill);
  background: var(--c-surface-sunken);
  color: var(--c-brand);
}

.date-field__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.date-field__value {
  color: var(--c-brand);
  font-weight: 600;
  white-space: nowrap;
}

.date-field__value--empty {
  color: var(--c-text-muted);
  font-weight: 400;
}

.popover {
  position: absolute;
  z-index: 60;
  top: calc(100% + var(--space-2));
  right: 0;
  width: min(320px, calc(100vw - 2 * var(--space-4)));
  padding: var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
  box-shadow: 0 16px 40px rgb(0 0 0 / 18%);
}

.popover__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.popover__month {
  font-weight: 600;
  text-transform: capitalize;
}

.popover__arrow {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--c-surface-sunken);
  color: var(--c-text);
  cursor: pointer;
}

.popover__weekdays,
.popover__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.popover__weekdays {
  margin-bottom: var(--space-1);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  text-align: center;
}

.popover__empty {
  height: 36px;
}

.popover__day {
  height: 36px;
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text);
  font: inherit;
  cursor: pointer;
}

.popover__day:hover {
  background: var(--c-surface-sunken);
}

.popover__day--today {
  box-shadow: inset 0 0 0 1px var(--c-brand);
}

.popover__day--selected {
  background: var(--c-brand);
  color: var(--c-surface);
  font-weight: 600;
}

.popover__quick {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.quick {
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text);
  font: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
}

.quick:hover {
  border-color: var(--c-brand);
  color: var(--c-brand);
}

.quick--muted {
  color: var(--c-text-muted);
}

.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
