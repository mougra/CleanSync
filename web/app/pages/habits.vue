<script setup lang="ts">
/**
 * Вкладка «Привычки» по макетам docs/design/mockups/привычки 1-4:
 * пустое состояние, список «Привычки на сегодня», лист выбора из каталога
 * и лист создания своей привычки.
 */
import type { Habit } from '~/types/habit';

const { t, locale } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
const api = useApi();
const { intervalLabel, categoryLabel } = useHabitLabels();

const { habits, dueToday, doneToday, catalog, categories, refreshMine } = await useHabits();

const pickerOpen = ref(false);
const createOpen = ref(false);
const busy = ref<number | null>(null);

const countLabel = computed(() => {
  const count = habits.value.length;
  if (locale.value !== 'ru') {
    return `${count} ${count === 1 ? t('habits.count_one') : t('habits.count_many')}`;
  }
  return `${count} ${pluralRu(count, t('habits.count_one'), t('habits.count_few'), t('habits.count_many'))}`;
});

const progressPercent = computed(() => {
  const total = habits.value.length;
  return total === 0 ? 0 : Math.round((doneToday.value.length / total) * 100);
});

const toggle = async (habit: Habit) => {
  if (busy.value !== null) {
    return;
  }

  busy.value = habit.id;
  try {
    await api.request(`/api/habits/${habit.id}/toggle`, { method: 'POST' });
    await refreshMine();
    await refreshNuxtData('achievements-earned');
  } finally {
    busy.value = null;
  }
};

const afterChange = async () => {
  pickerOpen.value = false;
  createOpen.value = false;
  clearNuxtData('habits-mine');
  await refreshMine();
  await refreshNuxtData('achievements-earned');
};

const rowMeta = (habit: Habit) =>
  [
    categoryLabel(habit.category),
    intervalLabel(habit.intervalCount, habit.intervalUnit),
    habit.zone,
    habit.streak > 0 ? t('habits.streak', { count: habit.streak }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

useSeoMeta({
  title: () => t('habits.title'),
  description: () =>
    'Полезные привычки для дома: пять минут порядка, вечерний сброс, уход за растениями и питомцами. Отмечайте каждый день и следите за серией.',
});
</script>

<template>
  <div class="page">
    <header class="page__head">
      <h1 class="page__title">{{ t('habits.title') }}</h1>
    </header>

    <!-- Гость: привычки привязаны к аккаунту -->
    <template v-if="!auth.isAuthenticated">
      <section class="empty">
        <IllustrationHabits />
        <h2 class="empty__title">{{ t('habits.emptyTitle') }}</h2>
        <p class="empty__text">{{ t('habits.signInHint') }}</p>
        <AppButton variant="filled" block :to="localePath('/login')">{{ t('auth.login') }}</AppButton>
      </section>
    </template>

    <!-- Пустое состояние из макета -->
    <template v-else-if="habits.length === 0">
      <section class="empty">
        <IllustrationHabits />
        <h2 class="empty__title">{{ t('habits.emptyTitle') }}</h2>
        <p class="empty__text">{{ t('habits.emptyText') }}</p>

        <AppButton variant="filled" block @click="pickerOpen = true">
          {{ t('habits.pick') }}
        </AppButton>

        <button type="button" class="link" @click="createOpen = true">
          <i class="pi pi-pencil" aria-hidden="true" />
          {{ t('habits.createOwn') }}
        </button>
      </section>
    </template>

    <!-- Список на сегодня -->
    <template v-else>
      <section class="today">
        <div class="today__head">
          <h2 class="today__title">{{ t('habits.todayTitle') }}</h2>
          <button type="button" class="link link--small" @click="pickerOpen = true">
            <i class="pi pi-sliders-h" aria-hidden="true" />
            {{ t('habits.edit') }}
          </button>
        </div>

        <p class="today__count">{{ countLabel }}</p>
        <ProgressBar thin :value="progressPercent" />

        <p v-if="dueToday.length === 0 && doneToday.length > 0" class="today__done">
          {{ t('habits.allDone') }}
        </p>

        <ul class="list">
          <li v-for="habit in [...dueToday, ...doneToday]" :key="habit.id">
            <HabitRow
              :title="habit.title"
              :icon="habit.icon"
              :done="habit.doneToday"
              :meta="rowMeta(habit)"
              :disabled="busy !== null"
              @toggle="toggle(habit)"
            />
          </li>
        </ul>

        <button type="button" class="pick-row" @click="pickerOpen = true">
          <i class="pi pi-plus" aria-hidden="true" />
          <span>{{ t('habits.pick') }}</span>
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </button>

        <button type="button" class="link" @click="createOpen = true">
          <i class="pi pi-pencil" aria-hidden="true" />
          {{ t('habits.createOwn') }}
        </button>
      </section>
    </template>

    <HabitPickerSheet
      :open="pickerOpen"
      :templates="catalog"
      :categories="categories"
      @close="pickerOpen = false"
      @added="afterChange"
    />

    <HabitCreateSheet :open="createOpen" @close="createOpen = false" @created="afterChange" />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.page__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page__title {
  font-size: var(--fs-display);
}

/* ── Пустое состояние ───────────────────────────────────────────────── */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) 0;
  text-align: center;
}

.empty__title {
  font-size: 1.375rem;
  max-width: 18ch;
}

.empty__text {
  color: var(--c-text-muted);
  max-width: 32ch;
}

/* ── Список на сегодня ─────────────────────────────────────────────── */
.today {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.today__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.today__title {
  font-size: 1.25rem;
}

.today__count {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.today__done {
  color: var(--c-brand);
  font-size: var(--fs-caption);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.pick-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 60px;
  padding: 0 var(--space-4);
  border: 1px dashed var(--c-border);
  border-radius: var(--r-card);
  background: transparent;
  color: var(--c-brand);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.pick-row span {
  flex: 1;
  text-align: left;
}

.link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  align-self: center;
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: none;
  background: transparent;
  color: var(--c-text);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.link--small {
  align-self: auto;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  font-weight: 500;
  text-decoration: none;
}
</style>
