<script setup lang="ts">
/**
 * Лист «Добавить задачу» из макета «Добавление Задачи через кнопку»: название,
 * зона, повтор с шагом, срок выполнения, напоминание (пока выключено) и сложность.
 *
 * Повтор в API описан парой «частота + день периода»: счётчика интервала
 * («раз в N недель») в схеме БД нет, поэтому число шага кодируется ближайшим
 * доступным значением — днём недели для недель и днём месяца для месяцев, а
 * подпись показывает то, что выбрал человек (см. `intervalLabel` и `repeatFor`).
 */
import type { ScheduleSummary, TaskCreateInput, TaskRepeat, TaskRepeatUnit } from '~/types/task';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; created: [] }>();

const { t, locale } = useI18n();
const api = useApi();

/** Расписание, в которое складываются задачи, созданные этой формой. */
const SCHEDULE_TITLE = 'Мои задачи';
const DEFAULT_ZONE_KEY = 'wholeHouse';
const MAX_INTERVAL = 12;

const repeatUnits: TaskRepeatUnit[] = ['once', 'day', 'week', 'month'];
const zones: string[] = [
  'kitchen',
  'bathroom',
  'bedroom',
  'livingRoom',
  'hallway',
  'kidsRoom',
  'office',
  'balcony',
  'yard',
  'garage',
  'wholeHouse',
];
const difficulties = [
  { key: 'easy', minutes: 15 },
  { key: 'medium', minutes: 30 },
  { key: 'hard', minutes: 45 },
] as const;

const title = ref('');
const zone = ref<string>(DEFAULT_ZONE_KEY);
const repeatUnit = ref<TaskRepeatUnit>('week');
const intervalCount = ref(1);
const dueDate = ref(todayForApi());
const difficulty = ref<(typeof difficulties)[number]['key']>('medium');
const pending = ref(false);
const failed = ref(false);

/**
 * Срок по умолчанию — сегодняшний день приложения.
 *
 * Сервер считает день в своём поясе (`APP_TIME_ZONE`, по умолчанию Москва),
 * поэтому и здесь берём тот же день: иначе задача, созданная ночью, не попала бы
 * в план на сегодня. Тот же день берётся и для дня недели.
 */
function todayForApi(): string {
  return appToday(useRuntimeConfig().public.appTimeZone);
}

const unitLabel = (unit: TaskRepeatUnit): string =>
  unit === 'once'
    ? t('tasks.intervalOnce')
    : unit === 'day'
      ? t('tasks.intervalDay')
      : unit === 'week'
        ? t('tasks.intervalWeek')
        : t('tasks.intervalMonth');

/** Подпись периода: «Один раз», «Раз в 1 неделю», «Раз в 3 месяца». */
const intervalLabel = computed(() => {
  if (repeatUnit.value === 'once') {
    return t('tasks.everyOnce');
  }

  if (intervalCount.value <= 1) {
    return repeatUnit.value === 'day'
      ? t('tasks.everyDay')
      : repeatUnit.value === 'week'
        ? t('tasks.everyWeek')
        : t('tasks.everyMonth');
  }

  const count = intervalCount.value;
  const forms =
    repeatUnit.value === 'day'
      ? [t('tasks.unitDayOne'), t('tasks.unitDayFew'), t('tasks.unitDayMany')]
      : repeatUnit.value === 'week'
        ? [t('tasks.unitWeekOne'), t('tasks.unitWeekFew'), t('tasks.unitWeekMany')]
        : [t('tasks.unitMonthOne'), t('tasks.unitMonthFew'), t('tasks.unitMonthMany')];

  const unitWord = locale.value === 'ru' ? pluralRu(count, forms[0]!, forms[1]!, forms[2]!) : count === 1 ? forms[0]! : forms[2]!;

  return t('tasks.everyN', { count, unit: unitWord });
});

/** Срок показываем как в макете: «Срок выполнения: окт. 11-го». */
const dueLabel = computed(() => `${t('tasks.dueDate')}: ${formatDay(dueDate.value)}`);

/** Разбор ISO-даты на части: без сдвига в локальный пояс, как того ждёт сервер. */
const dueParts = (value: string) => {
  const [year, month, day] = (value || todayForApi()).split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));

  return { date, day: date.getUTCDate(), weekday: date.getUTCDay() };
};

const formatDay = (value: string): string =>
  new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }).format(
    value ? fromISODate(value) : new Date(),
  );

const step = (delta: number) => {
  intervalCount.value = Math.min(MAX_INTERVAL, Math.max(1, intervalCount.value + delta));
};

const chooseUnit = (unit: TaskRepeatUnit) => {
  repeatUnit.value = unit;
  if (unit === 'once') {
    intervalCount.value = 1;
  }
};

const difficultyLabel = (key: (typeof difficulties)[number]['key']): string =>
  key === 'easy'
    ? t('tasks.difficultyEasy')
    : key === 'medium'
      ? t('tasks.difficultyMedium')
      : t('tasks.difficultyHard');

/**
 * Расписание «Мои задачи» заводим один раз: `POST /api/tasks` без `schedule_id`
 * отвечает 400, поэтому перед первой задачей создаём контейнер.
 */
const ensureSchedule = async (): Promise<number> => {
  const schedules = await api.request<ScheduleSummary[]>('/api/schedules');
  const existing = schedules.find((schedule) => schedule.title === SCHEDULE_TITLE);

  if (existing) {
    return existing.id;
  }

  const created = await api.request<ScheduleSummary>('/api/schedules', {
    method: 'POST',
    body: { title: SCHEDULE_TITLE, description: t('tasks.scheduleDescription') },
  });

  return created.id;
};

/**
 * Периодичность в терминах API. День недели и день месяца берём от выбранного
 * срока: тогда задача сразу попадает в план на сегодня, даже если она «раз в
 * неделю». Число шага схема не хранит — об этом сказано в шапке файла.
 */
const repeatFor = (): TaskRepeat => {
  if (repeatUnit.value === 'once') {
    return { frequency: 'once', day_of_week: null, day_of_month: null };
  }

  if (repeatUnit.value === 'day') {
    return { frequency: 'daily', day_of_week: null, day_of_month: null };
  }

  const parts = dueParts(dueDate.value);

  if (repeatUnit.value === 'week') {
    return { frequency: 'weekly', day_of_week: parts.weekday, day_of_month: null };
  }

  return { frequency: 'monthly', day_of_week: null, day_of_month: parts.day };
};

const reset = () => {
  title.value = '';
  zone.value = DEFAULT_ZONE_KEY;
  repeatUnit.value = 'week';
  intervalCount.value = 1;
  dueDate.value = todayForApi();
  difficulty.value = 'medium';
  failed.value = false;
};

const submit = async () => {
  if (!title.value.trim() || pending.value) {
    return;
  }

  pending.value = true;
  failed.value = false;

  try {
    const scheduleId = await ensureSchedule();
    const minutes = difficulties.find((item) => item.key === difficulty.value)?.minutes ?? 30;

    const body: TaskCreateInput = {
      schedule_id: scheduleId,
      title: title.value.trim(),
      room: t(`tasks.zone.${zone.value}`),
      due_date: dueDate.value || null,
      estimated_minutes: minutes,
      ...repeatFor(),
      // Счётчик «− N +» уходит в базу: без него «раз в 3 недели» сохранилось бы
      // как «каждую неделю». Для «один раз» интервал смысла не имеет.
      interval_count: repeatUnit.value === 'once' ? 1 : intervalCount.value,
    };

    await api.request('/api/tasks', { method: 'POST', body });

    reset();
    emit('created');
  } catch {
    failed.value = true;
  } finally {
    pending.value = false;
  }
};

watch(
  () => props.open,
  (open) => {
    // Закрыли лист — форма возвращается к значениям по умолчанию.
    if (!open) {
      reset();
    }
  },
);
</script>

<template>
  <AppSheet :open="open" @close="emit('close')">
    <template #header>
      <h2 class="title">{{ t('tasks.createTitle') }}</h2>
    </template>

    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span class="field__label">{{ t('tasks.fieldTitle') }}</span>
        <input
          v-model="title"
          class="field__input"
          type="text"
          maxlength="200"
          :placeholder="t('tasks.fieldTitlePlaceholder')"
          required
        >
      </label>

      <label class="field">
        <span class="field__label">{{ t('tasks.fieldZone') }}</span>
        <AppSelect
          v-model="zone"
          :options="zones.map((item) => ({ value: item, label: t(`tasks.zone.${item}`) }))"
          :aria-label="t('tasks.fieldZone')"
        />
      </label>

      <!-- Повтор: сегменты единицы и шаг «раз в N ...» -->
      <section class="card">
        <div class="row row--static">
          <span class="row__icon" aria-hidden="true"><i class="pi pi-refresh" /></span>
          <span class="row__label">{{ intervalLabel }}</span>
          <i class="pi pi-chevron-up" aria-hidden="true" />
        </div>

        <div class="repeat">
          <div class="segmented" role="group">
            <button
              v-for="unit in repeatUnits"
              :key="unit"
              type="button"
              class="segmented__item"
              :class="{ 'segmented__item--active': repeatUnit === unit }"
              :aria-pressed="repeatUnit === unit"
              @click="chooseUnit(unit)"
            >
              {{ unitLabel(unit) }}
            </button>
          </div>

          <div v-if="repeatUnit !== 'once'" class="stepper">
            <button
              type="button"
              class="stepper__btn"
              :aria-label="t('tasks.stepDown')"
              :disabled="intervalCount <= 1"
              @click="step(-1)"
            >
              <i class="pi pi-minus" aria-hidden="true" />
            </button>
            <span class="stepper__value">{{ intervalCount }}</span>
            <button
              type="button"
              class="stepper__btn"
              :aria-label="t('tasks.stepUp')"
              :disabled="intervalCount >= MAX_INTERVAL"
              @click="step(1)"
            >
              <i class="pi pi-plus" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <label class="card">
        <span class="row">
          <span class="row__icon" aria-hidden="true"><i class="pi pi-calendar" /></span>
          <span class="row__label">{{ dueLabel }}</span>
          <input v-model="dueDate" class="row__date" type="date" :aria-label="t('tasks.dueDate')" >
        </span>
      </label>

      <!--
        Напоминаний у своих задач в API нет: строка намеренно неактивна,
        чтобы переключатель не обещал того, чего сервер не умеет.
      -->
      <div class="card">
        <div class="row row--disabled">
          <span class="row__icon" aria-hidden="true"><i class="pi pi-bell" /></span>
          <span class="row__label">{{ t('tasks.reminder') }}: {{ t('tasks.reminderOff') }}</span>
          <span class="switch" aria-hidden="true"><span class="switch__dot" /></span>
        </div>
        <p class="hint">{{ t('tasks.reminderSoon') }}</p>
      </div>

      <section class="difficulty">
        <span class="field__label">{{ t('tasks.difficulty') }}</span>
        <div class="segmented" role="group">
          <button
            v-for="item in difficulties"
            :key="item.key"
            type="button"
            class="segmented__item segmented__item--wide"
            :class="{ 'segmented__item--active': difficulty === item.key }"
            :aria-pressed="difficulty === item.key"
            @click="difficulty = item.key"
          >
            {{ difficultyLabel(item.key) }}
          </button>
        </div>
      </section>

      <p v-if="failed" class="error">{{ t('tasks.createFailed') }}</p>
    </form>

    <template #footer>
      <AppButton variant="filled" block type="submit" :disabled="!title.trim() || pending" @click="submit">
        {{ t('tasks.save') }}
        <i class="pi pi-arrow-right" aria-hidden="true" />
      </AppButton>
    </template>
  </AppSheet>
</template>

<style scoped>
.title {
  font-size: var(--fs-title);
  text-align: center;
  width: 100%;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.field__input {
  min-height: 52px;
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
}

.card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 60px;
  padding: 0 var(--space-4);
  color: var(--c-text);
}

/* Строка-подпись (повтор) и строка с датой: поле живёт внутри строки */
.row--static {
  cursor: default;
}

.row--disabled {
  color: var(--c-text-muted);
}

.row__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: var(--r-chip);
  background: var(--c-accent-soft);
  color: var(--c-accent);
}

.row__label {
  flex: 1;
  min-width: 0;
}

.row__date {
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  font-size: var(--fs-caption);
}

.repeat {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4) var(--space-4);
  border-top: 1px solid var(--c-border);
}

.segmented {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.segmented__item {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-chip);
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.segmented__item--active {
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
  color: var(--c-accent);
  font-weight: 600;
}

.segmented__item--wide {
  flex: 1;
  min-width: 88px;
}

.stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
}

.stepper__btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-chip);
  background: var(--c-surface-warm);
  color: var(--c-accent);
  cursor: pointer;
}

.stepper__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.stepper__value {
  min-width: 2ch;
  text-align: center;
  font-size: var(--fs-title);
  font-weight: 600;
}

.hint {
  padding: 0 var(--space-4) var(--space-3);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.difficulty {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.switch {
  width: 46px;
  height: 26px;
  flex: 0 0 46px;
  padding: 3px;
  border-radius: var(--r-pill);
  background: var(--c-track);
}

.switch__dot {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: var(--r-pill);
  background: var(--c-surface);
}

.error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}
</style>
