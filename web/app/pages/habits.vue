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
const { zoneLabel } = useZoneLabel();
const { show: showAchievements } = useAchievementToast();

const { habits, dueToday, doneToday, week, today, catalog, categories, refreshMine, archiveHabit } =
  await useHabits();

const pickerOpen = ref(false);
const busy = ref<number | null>(null);

/** Лист привычки: `true` — создание, `habit` — правка существующей. */
const formOpen = ref(false);
const editingHabit = ref<Habit | null>(null);

/** Лист действий у строки: открыт для этой привычки. */
const actionsHabit = ref<Habit | null>(null);
const actionBusy = ref(false);
const actionError = ref('');

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
    const response = await api.request<{ awarded?: string[] }>(`/api/habits/${habit.id}/toggle`, {
      method: 'POST',
    });
    await refreshMine();
    await refreshNuxtData('achievements-progress');
    await showAchievements(response.awarded);
  } finally {
    busy.value = null;
  }
};

/** Открыть лист создания своей привычки. */
const openCreate = () => {
  editingHabit.value = null;
  formOpen.value = true;
};

/** Открыть правку из листа действий. */
const openEditFromActions = () => {
  const habit = actionsHabit.value;

  if (!habit) {
    return;
  }

  actionError.value = '';
  actionsHabit.value = null;
  editingHabit.value = habit;
  formOpen.value = true;
};

const closeForm = () => {
  formOpen.value = false;
  editingHabit.value = null;
};

const openActions = (habit: Habit) => {
  actionError.value = '';
  actionsHabit.value = habit;
};

const closeActions = () => {
  actionsHabit.value = null;
  actionError.value = '';
};

/** Удаление (архив) с подтверждением в листе действий. */
const confirmDelete = async () => {
  const habit = actionsHabit.value;

  if (!habit || actionBusy.value) {
    return;
  }

  actionBusy.value = true;
  actionError.value = '';

  try {
    await archiveHabit(habit.id);
    closeActions();
    await refreshNuxtData('achievements-progress');
  } catch {
    actionError.value = t('habits.deleteFailed');
  } finally {
    actionBusy.value = false;
  }
};

const afterChange = async () => {
  pickerOpen.value = false;
  closeForm();
  clearNuxtData('habits-mine');
  await refreshMine();
  await refreshNuxtData('achievements-progress');
};

const rowMeta = (habit: Habit) =>
  [
    categoryLabel(habit.category),
    intervalLabel(habit.intervalCount, habit.intervalUnit),
    zoneLabel(habit.zone),
    habit.streak > 0 ? t('habits.streak', { count: habit.streak }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * Статьи о привычках: блок «Советы» внизу страницы.
 *
 * Берём статьи текущей локали (для английской — коллекцию `tipsEn`), чтобы
 * названия не пришлось дублировать в i18n: источник правды — Markdown.
 */
const { data: habitTips } = await useAsyncData(
  () => `habit-tips-${locale.value}`,
  async () => {
    const collection = locale.value === 'en' ? 'tipsEn' : 'tips';

    return await queryCollection(collection)
      .where('category', '=', 'habits')
      .order('order', 'DESC')
      .limit(4)
      .all();
  },
  { watch: [locale] },
);

useSeoMeta({
  title: () => t('habits.title'),
  description: () => t('habits.metaDescription'),
});

/** Ключевые слова страницы: отдельным meta, потому что в useSeoMeta их нет. */
useHead(() => ({
  meta: [{ name: 'keywords', content: t('habits.metaKeywords') }],
}));
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

        <button type="button" class="link" @click="openCreate">
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
            >
              <template #actions>
                <button
                  type="button"
                  class="habit-more"
                  :aria-label="t('habits.actions')"
                  @click="openActions(habit)"
                >
                  <i class="pi pi-ellipsis-v" aria-hidden="true" />
                </button>
              </template>
            </HabitRow>
          </li>
        </ul>

        <button type="button" class="pick-row" @click="pickerOpen = true">
          <i class="pi pi-plus" aria-hidden="true" />
          <span>{{ t('habits.pick') }}</span>
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </button>

        <button type="button" class="link" @click="openCreate">
          <i class="pi pi-pencil" aria-hidden="true" />
          {{ t('habits.createOwn') }}
        </button>
      </section>

      <HabitWeek :days="week" :today="today" />
    </template>

    <!-- Советы по привычкам: перелинковка с SEO-кластером статей -->
    <section v-if="habitTips?.length" class="tips">
      <h2 class="tips__title">{{ t('habits.tipsTitle') }}</h2>

      <ul class="tips__list">
        <li v-for="tip in habitTips" :key="tip.path">
          <NuxtLink :to="localePath(tip.path)" class="tips__link">
            <span class="tips__name">{{ tip.title }}</span>
            <span class="tips__meta">{{ tip.minutes }} {{ t('tipsPage.minutes') }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <HabitPickerSheet
      :open="pickerOpen"
      :templates="catalog"
      :categories="categories"
      @close="pickerOpen = false"
      @added="afterChange"
    />

    <HabitCreateSheet
      :open="formOpen"
      :habit="editingHabit"
      @close="closeForm"
      @saved="afterChange"
    />

    <HabitActionsSheet
      :open="actionsHabit !== null"
      :title="actionsHabit?.title ?? ''"
      :pending="actionBusy"
      :error="actionError"
      @close="closeActions"
      @edit="openEditFromActions"
      @delete="confirmDelete"
    />
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
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
}

/*
 * «⋯» у строки привычки: та же высота, что у строки, и такой же радиус —
 * рядом со строкой он читается как её часть, а не как отдельная кнопка.
 */
.habit-more {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  min-height: 72px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
  color: var(--c-text-muted);
  cursor: pointer;
}

.habit-more:hover {
  background: var(--c-surface-sunken);
  color: var(--c-text);
}

/* ── Советы по привычкам ───────────────────────────────────────────────── */
.tips {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.tips__title {
  font-size: var(--fs-title);
}

.tips__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tips__link {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface-mint);
  color: var(--c-text);
  text-decoration: none;
}

.tips__link:hover .tips__name {
  color: var(--c-brand);
}

.tips__name {
  font-weight: 600;
}

.tips__meta {
  flex: none;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

@media (min-width: 768px) {
  /* Десктоп: привычки в две колонки — список перестаёт быть простынёй */
  .page {
    gap: var(--space-5);
  }

  .list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }
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
