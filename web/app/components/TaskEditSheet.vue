<script setup lang="ts">
/**
 * Лист «Изменить задачу» из «Плана на сегодня»: название и периодичность.
 *
 * Правит ровно то, что просил заказчик: текст задачи и частоту. Зона, минуты,
 * время и дата постановки остаются прежними — их здесь не показываем, и
 * придумывать им новые значения из ниоткуда нельзя (подробности о теле запроса
 * знает страница, которая сохраняет).
 *
 * Отдельный лист, а не правка прямо в строке: строка отмечается одним тапом, и
 * поле ввода на её месте ломало бы эту привычку. Заодно видно, что именно
 * меняется, пока шторка открыта.
 *
 * Периодичность повторяет подход листа создания (`TaskCreateSheet`): единица
 * списком (`AppSelect` — нативные `<select>` в проекте не используются) и шаг
 * «раз в N …» кнопками − / +. Значения подставляются из задачи, поэтому открытие
 * формы не «сбрасывает» настройки человека.
 */
import type { TaskFrequency } from '~/types/checklist';
import type { TaskEditInput, TaskEditSource, TaskRepeatUnit } from '~/types/task';

const props = defineProps<{
  open: boolean;
  /** Исходная задача: из неё подставляются название и периодичность. */
  task: TaskEditSource | null;
  /** Идёт сохранение: поля и кнопки заблокированы. */
  pending?: boolean;
  /** Сохранение не прошло: причина остаётся в листе, а не пропадает молча. */
  error?: string;
}>();

const emit = defineEmits<{ close: []; save: [TaskEditInput] }>();

const { t, locale } = useI18n();

/**
 * Единицы повтора в порядке API (`TaskFrequency`): «один раз», день, неделя,
 * месяц — тот же набор, что хранит задача, поэтому преобразование одностороннее.
 */
const repeatUnits: TaskRepeatUnit[] = ['once', 'day', 'week', 'month'];

const title = ref('');
const repeatUnit = ref<TaskRepeatUnit>('week');

/**
 * Интервал задачи в днях — то, что уходит в `interval_count` (миграция 0022).
 * Счётчик «− N +» при этом шагает единицей выбранной шкалы, поэтому в форме
 * «раз в 3 недели» показывается как 3, а в API уходит 21: одна единица измерения
 * и одно место преобразования (utils/repeatInterval.ts) на оба листа.
 */
const intervalDays = ref(DAYS_PER_REPEAT_UNIT.week);

/** Счётчик в единицах выбранной шкалы: неделя — 7 дней, месяц — 30. */
const intervalCount = computed(() => intervalCountForUnit(intervalDays.value, repeatUnit.value));

/** Из частоты задачи в единицу формы: без частоты задача разовая. */
const unitOf = (frequency: TaskFrequency | null): TaskRepeatUnit =>
  frequency === 'daily'
    ? 'day'
    : frequency === 'weekly'
      ? 'week'
      : frequency === 'monthly'
        ? 'month'
        : 'once';

/** Подстановка значений задачи: вызывается при открытии листа. */
const fill = (task: TaskEditSource | null) => {
  title.value = task?.title ?? '';
  repeatUnit.value = unitOf(task?.frequency ?? null);
  intervalDays.value = clampIntervalDays(task?.intervalCount ?? 1, repeatUnit.value);
};

watch(
  () => props.open,
  (open) => {
    if (open) {
      fill(props.task);
    }
  },
  { immediate: true },
);

const unitLabel = (unit: TaskRepeatUnit): string =>
  unit === 'once'
    ? t('tasks.intervalOnce')
    : unit === 'day'
      ? t('tasks.intervalDay')
      : unit === 'week'
        ? t('tasks.intervalWeek')
        : t('tasks.intervalMonth');

/** Подпись выбранного периода: «Раз в 1 неделю», «Раз в 3 месяца». */
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

  // Склонения — как везде в проекте: русские формы через `pluralRu`, английские
  // довольствуются единственным и множественным числом.
  const unitWord =
    locale.value === 'ru'
      ? pluralRu(count, forms[0]!, forms[1]!, forms[2]!)
      : count === 1
        ? forms[0]!
        : forms[2]!;

  return t('tasks.everyN', { count, unit: unitWord });
});

/** «Один раз» интервала не имеет — счётчик прячем, как в создании задачи. */
const chooseUnit = (unit: TaskRepeatUnit) => {
  const days = intervalDays.value;

  repeatUnit.value = unit;
  // Смена шкалы сохраняет срок: «раз в 3 недели» при переключении на дни — это 21
  // день, а не «раз в 3 дня».
  intervalDays.value = clampIntervalDays(unit === 'once' ? 1 : days, unit);
};

const step = (delta: number) => {
  intervalDays.value = stepIntervalDays(intervalDays.value, repeatUnit.value, delta);
};

/**
 * Отдать выбранное странице: запросы делает она, потому что только там известно,
 * сгенерирована задача (тогда нужен `DELETE` + `POST`) или создана человеком
 * (достаточно `PUT`).
 */
const submit = () => {
  const value = title.value.trim();

  if (!value || props.pending) {
    return;
  }

  emit('save', {
    title: value,
    frequency: repeatUnit.value,
    // Интервал в днях: 21 — «раз в 3 недели», 90 — «раз в 3 месяца».
    intervalCount: repeatUnit.value === 'once' ? 1 : intervalDays.value,
  });
};
</script>

<template>
  <!--
    Лист не прячется за `v-if`: его разметка (заголовок, поле названия и выбор
    периодичности) есть в серверном HTML, поэтому страница знает про правку ещё
    до первого нажатия. Пока лист закрыт, `AppSheet` держит его через `v-show`.
  -->
  <AppSheet :open="open" @close="emit('close')">
    <template #header>
      <h2 class="title">{{ t('tasks.editTitle') }}</h2>
    </template>

    <form class="form" @submit.prevent="submit">
      <label class="field">
        <!-- Подписи те же, что в листе создания: это одно и то же поле задачи. -->
        <span class="field__label">{{ t('tasks.fieldTitle') }}</span>
        <input
          v-model="title"
          class="field__input"
          type="text"
          maxlength="200"
          :placeholder="t('tasks.fieldTitlePlaceholder')"
          :disabled="pending"
          required
        >
      </label>

      <!-- Периодичность: единица списком и шаг «раз в N ...» -->
      <section class="card">
        <div class="repeat">
          <label class="field">
            <span class="field__label">{{ t('tasks.editInterval') }}</span>
            <AppSelect
              :model-value="repeatUnit"
              :options="repeatUnits.map((unit) => ({ value: unit, label: unitLabel(unit) }))"
              :aria-label="t('tasks.editInterval')"
              :disabled="pending"
              @update:model-value="chooseUnit($event as TaskRepeatUnit)"
            />
          </label>

          <div v-if="repeatUnit !== 'once'" class="stepper">
            <button
              type="button"
              class="stepper__btn"
              :aria-label="t('tasks.stepDown')"
              :disabled="pending || intervalCount <= 1"
              @click="step(-1)"
            >
              <i class="pi pi-minus" aria-hidden="true" />
            </button>
            <span class="stepper__value">{{ intervalCount }}</span>
            <button
              type="button"
              class="stepper__btn"
              :aria-label="t('tasks.stepUp')"
              :disabled="pending || intervalDays >= MAX_INTERVAL_DAYS"
              @click="step(1)"
            >
              <i class="pi pi-plus" aria-hidden="true" />
            </button>
          </div>

          <p class="hint">{{ intervalLabel }}</p>
        </div>
      </section>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <div class="actions">
        <AppButton variant="filled" block type="submit" :disabled="!title.trim() || pending" @click="submit">
          {{ t('tasks.editSave') }}
        </AppButton>

        <AppButton variant="outline" block type="button" :disabled="pending" @click="emit('close')">
          {{ t('tasks.editCancel') }}
        </AppButton>
      </div>
    </template>
  </AppSheet>
</template>

<style scoped>
.title {
  width: 100%;
  font-size: var(--fs-title);
  text-align: center;
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

.field__input:disabled {
  opacity: 0.6;
}

.card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
}

.repeat {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
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
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
