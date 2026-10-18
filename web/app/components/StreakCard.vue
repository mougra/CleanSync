<script setup lang="ts">
/**
 * Личная серия, заморозки и недельная цель.
 *
 * Смысл блока — не «победить кого-то», а не потерять серию: день засчитывается
 * за любой закрытый пункт, а заморозка позволяет пропустить день без потерь.
 */
const props = withDefaults(defineProps<{ details?: boolean }>(), { details: false });

const { t, locale } = useI18n();
const { streak, setWeeklyGoal } = await useStreak();

const saving = ref(false);

/** Русский требует трёх форм, английскому хватает одной. */
const daysWord = computed(() =>
  locale.value === 'ru'
    ? pluralRu(streak.value?.current ?? 0, t('streak.daysOne'), t('streak.daysFew'), t('streak.daysMany'))
    : t('streak.daysOne'),
);

const goalWord = (value: number) =>
  locale.value === 'ru'
    ? pluralRu(value, t('streak.goalDaysOne'), t('streak.goalDaysFew'), t('streak.goalDaysMany'))
    : value === 1
      ? t('streak.goalDaysOne')
      : t('streak.goalDaysMany');

const lastActiveLabel = computed(() => {
  const day = streak.value?.lastActiveOn;

  if (!day) {
    return t('streak.never');
  }

  return new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long' }).format(
    fromISODate(day),
  );
});

const weekdayLabels = computed(() =>
  streak.value?.week.days.map((day) =>
    new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(fromISODate(day.date)),
  ) ?? [],
);

const bestLabel = computed(() => streak.value?.best ?? 0);
const progress = computed(() => {
  if (!streak.value) {
    return 0;
  }

  const { activeDays, target } = streak.value.week;

  return Math.min(100, Math.round((activeDays / Math.max(1, target)) * 100));
});

/**
 * Варианты недельной цели: «1 день в неделю» … «7 дней в неделю».
 *
 * Число — часть подписи, а не украшение: без него «день в неделю», «дня
 * в неделю» и «дней в неделю» отличались только склонением, и в списке стояли
 * три одинаковые строки — по ним нельзя было выбрать цель.
 */
const goalOptions = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const value = index + 1;

    return { value, label: `${value} ${goalWord(value)}` };
  })
);

const changeTarget = async (value: string | number) => {
  const target = Number(value);

  if (!Number.isInteger(target)) {
    return;
  }

  saving.value = true;

  try {
    await setWeeklyGoal(target);
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <section v-if="streak" class="streak card">
    <header class="streak__head">
      <div class="streak__flame" :class="{ 'streak__flame--hot': streak.current > 0 }">
        <i class="pi pi-bolt" aria-hidden="true" />
        <span class="streak__number">{{ streak.current }}</span>
      </div>

      <div class="streak__titles">
        <p class="streak__title">
          {{ daysWord }}
        </p>
        <p class="streak__hint">
          {{ streak.todayDone ? t('streak.todayDone') : t('streak.todayPending') }}
        </p>
      </div>

      <p class="streak__best">{{ t('streak.best') }}: {{ bestLabel }}</p>
    </header>

    <div class="streak__week">
      <div class="streak__week-head">
        <span>{{ t('streak.weekGoal') }}</span>
        <strong>{{ streak.week.activeDays }} / {{ streak.week.target }}</strong>
      </div>

      <ol class="streak__days">
        <li
          v-for="(day, index) in streak.week.days"
          :key="day.date"
          class="streak__day"
          :class="{
            'streak__day--done': day.active,
            'streak__day--today': day.isToday,
          }"
        >
          <span class="streak__day-dot" />
          <span class="streak__day-label">{{ weekdayLabels[index] }}</span>
        </li>
      </ol>

      <ProgressBar :value="progress" />
    </div>

    <div v-if="props.details" class="streak__meta">
      <p class="streak__meta-line">
        <i class="pi pi-shield" aria-hidden="true" />
        {{ t('streak.freezes') }}: <strong>{{ streak.freezesAvailable }}</strong>
        <span class="streak__meta-hint">{{ t('streak.freezesHint') }}</span>
      </p>
      <p class="streak__meta-line">
        {{ t('streak.freezesUsed') }}: {{ streak.freezesUsedTotal }}
      </p>
      <p class="streak__meta-line">
        {{ t('streak.lastActive') }}:
        {{ lastActiveLabel }}
      </p>
    </div>

    <label class="streak__goal">
      <span class="streak__goal-label">{{ t('streak.goalLabel') }}</span>
      <AppSelect
        compact
        :model-value="streak.week.target"
        :disabled="saving"
        :options="goalOptions"
        :aria-label="t('streak.goalLabel')"
        @update:model-value="changeTarget"
      />
    </label>

    <p v-if="streak.week.met" class="streak__done">
      <i class="pi pi-check-circle" aria-hidden="true" />
      {{ t('streak.weekMet') }}
    </p>
  </section>
</template>

<style scoped>
.streak {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.streak__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.streak__flame {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface-warm);
  color: var(--c-text-muted);
  font-size: var(--fs-title);
  font-weight: 700;
}

.streak__flame--hot {
  background: var(--c-brand-soft);
  color: var(--c-brand);
}

.streak__number {
  font-size: var(--fs-display);
  line-height: 1;
}

.streak__titles {
  flex: 1;
  min-width: 0;
}

.streak__title {
  font-weight: 600;
}

.streak__hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.streak__best {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  white-space: nowrap;
}

.streak__week {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.streak__week-head {
  display: flex;
  justify-content: space-between;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.streak__days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.streak__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.streak__day-dot {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--c-border);
}

.streak__day--done .streak__day-dot {
  background: var(--c-brand);
}

.streak__day--today .streak__day-label {
  color: var(--c-text);
  font-weight: 600;
}

.streak__day-label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.streak__meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface-mint);
  font-size: var(--fs-caption);
}

.streak__meta-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.streak__meta-hint {
  color: var(--c-text-muted);
}

.streak__goal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.streak__goal-label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.streak__done {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--c-brand);
  font-size: var(--fs-caption);
}
</style>
