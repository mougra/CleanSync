<script setup lang="ts">
/**
 * Лист «Создать привычку» из макетов: название, зона, период с шагом,
 * срок выполнения и переключатель напоминания.
 */
import type { HabitIntervalUnit } from '~/types/habit';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; created: [] }>();

const { t, locale } = useI18n();
const api = useApi();
const { intervalLabel } = useHabitLabels();

const title = ref('');
const zone = ref('');
const intervalCount = ref(1);
const intervalUnit = ref<HabitIntervalUnit>('day');
const dueDate = ref('');
const reminderEnabled = ref(false);
const reminderTime = ref('19:00');
const pending = ref(false);
const frequencyOpen = ref(false);

const units: HabitIntervalUnit[] = ['once', 'month', 'week', 'day'];

const dueLabel = computed(() => {
  const formatted = dueDate.value
    ? new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }).format(
        new Date(dueDate.value),
      )
    : new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }).format(new Date());

  return `${t('habits.dueDate')}: ${formatted}`;
});

const step = (delta: number) => {
  intervalCount.value = Math.min(30, Math.max(1, intervalCount.value + delta));
};

const reset = () => {
  title.value = '';
  zone.value = '';
  intervalCount.value = 1;
  intervalUnit.value = 'day';
  dueDate.value = '';
  reminderEnabled.value = false;
  reminderTime.value = '19:00';
  frequencyOpen.value = false;
};

const submit = async () => {
  if (!title.value.trim() || pending.value) {
    return;
  }

  pending.value = true;
  try {
    await api.request('/api/habits', {
      method: 'POST',
      body: {
        title: title.value.trim(),
        zone: zone.value.trim() || null,
        intervalCount: intervalCount.value,
        intervalUnit: intervalUnit.value,
        dueDate: dueDate.value || null,
        reminderEnabled: reminderEnabled.value,
        reminderTime: reminderEnabled.value ? reminderTime.value : null,
      },
    });
    reset();
    emit('created');
  } finally {
    pending.value = false;
  }
};

watch(
  () => props.open,
  (open) => {
    if (!open) {
      reset();
    }
  },
);
</script>

<template>
  <AppSheet :open="open" @close="emit('close')">
    <template #header>
      <h2 class="title">{{ t('habits.createTitle') }}</h2>
    </template>

    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span class="field__label">{{ t('habits.fieldTitle') }}</span>
        <input
          v-model="title"
          class="field__input"
          type="text"
          maxlength="120"
          :placeholder="t('habits.fieldTitlePlaceholder')"
          required
        >
      </label>

      <label class="field">
        <span class="field__label">{{ t('habits.fieldZone') }}</span>
        <input
          v-model="zone"
          class="field__input"
          type="text"
          maxlength="120"
          :placeholder="t('habits.fieldZonePlaceholder')"
        >
      </label>

      <section class="card">
        <button type="button" class="row" @click="frequencyOpen = !frequencyOpen">
          <span class="row__icon" aria-hidden="true"><i class="pi pi-refresh" /></span>
          <span class="row__label">{{ intervalLabel(intervalCount, intervalUnit) }}</span>
          <i :class="['pi', frequencyOpen ? 'pi-chevron-up' : 'pi-chevron-down']" aria-hidden="true" />
        </button>

        <div v-if="frequencyOpen" class="frequency">
          <div class="segmented" role="group">
            <button
              v-for="unit in units"
              :key="unit"
              type="button"
              class="segmented__item"
              :class="{ 'segmented__item--active': intervalUnit === unit }"
              :aria-pressed="intervalUnit === unit"
              @click="intervalUnit = unit"
            >
              {{ unit === 'once' ? t('habitInterval.once') : t(`habitUnit.${unit}`) }}
            </button>
          </div>

          <div v-if="intervalUnit !== 'once'" class="stepper">
            <button type="button" class="stepper__btn" :aria-label="'-'" @click="step(-1)">
              <i class="pi pi-minus" aria-hidden="true" />
            </button>
            <span class="stepper__value">{{ intervalCount }}</span>
            <button type="button" class="stepper__btn" :aria-label="'+'" @click="step(1)">
              <i class="pi pi-plus" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <label class="card row">
        <span class="row__icon" aria-hidden="true"><i class="pi pi-calendar" /></span>
        <span class="row__label">{{ dueLabel }}</span>
        <input v-model="dueDate" class="row__date" type="date" >
      </label>

      <div class="card row">
        <span class="row__icon" aria-hidden="true"><i class="pi pi-bell" /></span>
        <span class="row__label">
          {{ t('habits.reminder') }}: {{ reminderEnabled ? t('habits.reminderOn') : t('habits.reminderOff') }}
        </span>
        <input
          v-if="reminderEnabled"
          v-model="reminderTime"
          class="row__date"
          type="time"
          :aria-label="t('habits.reminderTime')"
        >
        <button
          type="button"
          class="row__switch"
          :aria-pressed="reminderEnabled"
          :aria-label="t('habits.reminder')"
          @click="reminderEnabled = !reminderEnabled"
        >
          <span class="switch" :class="{ 'switch--on': reminderEnabled }" aria-hidden="true">
            <span class="switch__dot" />
          </span>
        </button>
      </div>
    </form>

    <template #footer>
      <AppButton variant="filled" block type="submit" :disabled="!title.trim() || pending" @click="submit">
        {{ t('habits.save') }}
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
  border: none;
  background: transparent;
  color: var(--c-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
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
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  font-size: var(--fs-caption);
}

.row__switch {
  display: grid;
  place-items: center;
  min-height: var(--tap-min);
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.frequency {
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
}

.segmented__item--active {
  border-color: var(--c-accent);
  color: var(--c-accent);
  font-weight: 600;
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

.stepper__value {
  min-width: 2ch;
  text-align: center;
  font-size: var(--fs-title);
  font-weight: 600;
}

.switch {
  width: 46px;
  height: 26px;
  flex: 0 0 46px;
  padding: 3px;
  border-radius: var(--r-pill);
  background: var(--c-track);
  transition: background-color 0.15s ease;
}

.switch--on {
  background: var(--c-brand);
}

.switch__dot {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: var(--r-pill);
  background: var(--c-surface);
  transition: transform 0.15s ease;
}

.switch--on .switch__dot {
  transform: translateX(20px);
}
</style>
