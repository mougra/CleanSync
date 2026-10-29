<script setup lang="ts">
/**
 * «Мои задачи» — единственный раздел управления своими делами.
 *
 * Решение заказчика (28 октября 2026): отдельные чек-листы больше не нужны.
 * Здесь три взгляда на одно и то же:
 *  - «Мои задачи» — **только свои** дела: созданные вручную и добавленные
 *    наборами. Базовый набор сюда не подмешивается: он живёт отдельно, потому
 *    что он есть у всех и не является «моим» списком (решение 30 октября);
 *  - «Базовый набор» — дела, которые создал генератор (81 → 79 дел). Их можно
 *    править и удалять: правка названия снимает метку «из набора» и переносит
 *    дело в «Мои задачи»;
 *  - «Готовые наборы» — прежние шаблоны, но «добавить» теперь значит добавить
 *    пункты **разово на сегодня**, а не завести ещё один список.
 *
 * Отметки остаются в плане дня: раздел управляет делами, а не выполняет их.
 */
import type { TaskFrequency } from '~/types/checklist';
import type { TaskEditInput, TaskEditSource, TaskRepeatUnit } from '~/types/task';

const { t, locale } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
const api = useApi();
const { openSheet, open: sheetOpen } = useTaskSheet();
const repeatText = useTaskRepeatLabel();
const { zoneLabel } = useZoneLabel();

interface MineTask {
  id: number;
  schedule_id: number;
  title: string;
  room: string | null;
  estimated_minutes: number | null;
  frequency: TaskFrequency | null;
  interval_count: number | null;
  day_of_week: number | null;
  day_of_month: number | null;
  due_date: string | null;
  source: string | null;
  schedule_title: string;
  is_completed: boolean;
}

interface Template {
  id: number;
  title: string;
  description: string | null;
  items_count: number;
}

const tab = ref<'mine' | 'base' | 'sets'>('mine');

/** Метка задач, которые создал генератор базового набора. */
const DEFAULT_TASK_SOURCE = 'home_profile_defaults';

const { data: mine, refresh: refreshMine } = await useAsyncData('my-tasks', () =>
  auth.isAuthenticated
    ? api.request<{ tasks: MineTask[] }>('/api/tasks/mine')
    : Promise.resolve({ tasks: [] as MineTask[] }),
);

const { data: templates } = await useAsyncData(
  'checklist-templates',
  () => api.request<Template[]>('/api/checklists/templates'),
  { default: () => [] as Template[] },
);

const tasks = computed<MineTask[]>(() => mine.value?.tasks ?? []);

/** «Мои задачи» — только своё: без базового набора. */
const ownTasks = computed(() =>
  tasks.value.filter((task) => task.source !== DEFAULT_TASK_SOURCE),
);

/** Базовый набор — то, что создал генератор; живёт отдельной вкладкой. */
const baseTasks = computed(() =>
  tasks.value.filter((task) => task.source === DEFAULT_TASK_SOURCE),
);

/** Склонение «пункт / пункта / пунктов» в готовых наборах. */
const itemsLabel = (count: number) =>
  locale.value === 'ru'
    ? pluralRu(count, t('checklists.items_one'), t('checklists.items_few'), t('checklists.items_many'))
    : count === 1
      ? t('checklists.items_one')
      : t('checklists.items_many');

/** Подпись строки: зона, частота и минуты — без названия списка, оно шумит. */
const hintOf = (task: MineTask): string =>
  [
    zoneLabel(task.room),
    repeatText(task),
    task.estimated_minutes ? t('plan.minutes', { minutes: task.estimated_minutes }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

/** Создание идёт общей шторкой: после закрытия список перечитывается. */
const openAddTask = async () => {
  await openSheet();
};

watch(sheetOpen, async (open, previous) => {
  if (previous && !open) {
    await refreshMine();
    await refreshNuxtData(['today-plan', 'calendar-day', 'calendar-week']);
  }
});

// ── Правка ─────────────────────────────────────────────────────────────────

const editing = ref<MineTask | null>(null);
const editPending = ref(false);
const editError = ref('');

const editSource = computed<TaskEditSource | null>(() =>
  editing.value
    ? {
        title: editing.value.title,
        frequency: editing.value.frequency,
        intervalCount: editing.value.interval_count,
      }
    : null,
);

const apiFrequency = (unit: TaskRepeatUnit): TaskFrequency =>
  unit === 'day' ? 'daily' : unit === 'week' ? 'weekly' : unit === 'month' ? 'monthly' : 'once';

/**
 * День периода при смене частоты.
 *
 * День недели и число месяца форма не собирает — переносим их из задачи, а если
 * там пусто (раньше была другая частота), берём из даты постановки. Так правка
 * названия не переставляет дело на другой день.
 */
const repeatBody = (task: MineTask, unit: TaskRepeatUnit) => {
  if (unit === 'once' || unit === 'day') {
    return { frequency: apiFrequency(unit), day_of_week: null, day_of_month: null };
  }

  const anchor = task.due_date ? fromISODate(task.due_date) : new Date();

  return unit === 'week'
    ? { frequency: 'weekly', day_of_week: task.day_of_week ?? anchor.getUTCDay(), day_of_month: null }
    : { frequency: 'monthly', day_of_week: null, day_of_month: task.day_of_month ?? anchor.getUTCDate() };
};

const saveEdit = async (input: TaskEditInput) => {
  const task = editing.value;

  if (!task || editPending.value) {
    return;
  }

  editPending.value = true;
  editError.value = '';

  try {
    await api.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      body: {
        title: input.title,
        ...repeatBody(task, input.frequency),
        interval_count: input.intervalCount,
      },
    });

    editing.value = null;
    await refreshMine();
    await refreshNuxtData(['today-plan', 'calendar-day', 'calendar-week']);
  } catch {
    editError.value = t('tasks.editFailed');
  } finally {
    editPending.value = false;
  }
};

const remove = async (task: MineTask) => {
  if (!window.confirm(t('checklists.deleteConfirm'))) {
    return;
  }

  try {
    await api.request(`/api/tasks/${task.id}`, { method: 'DELETE' });
    await refreshMine();
    await refreshNuxtData(['today-plan', 'calendar-day', 'calendar-week']);
  } catch {
    // Список остаётся прежним: сервер уже сказал, что удалить не вышло.
  }
};

// ── Готовые наборы ─────────────────────────────────────────────────────────

const adding = ref<number | null>(null);
const added = ref('');

const addSet = async (template: Template) => {
  if (!auth.isAuthenticated) {
    await navigateTo(localePath('/login'));
    return;
  }

  adding.value = template.id;
  added.value = '';

  try {
    const response = await api.request<{ added: number }>(
      `/api/checklists/from-template/${template.id}`,
      { method: 'POST' },
    );

    added.value = t('checklists.addedSet', { count: response.added });
    await refreshMine();
    await refreshNuxtData(['today-plan', 'calendar-day', 'calendar-week']);
  } finally {
    adding.value = null;
  }
};

useSeoMeta({
  title: () => t('nav.checklists'),
  description: () => t('checklistsPage.metaDescription'),
});
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('nav.checklists') }}</h1>

    <div class="segmented" role="group">
      <button
        type="button"
        class="segmented__item"
        :class="{ 'segmented__item--active': tab === 'mine' }"
        :aria-pressed="tab === 'mine'"
        @click="tab = 'mine'"
      >
        {{ t('checklists.mineTab') }}
      </button>
      <button
        type="button"
        class="segmented__item"
        :class="{ 'segmented__item--active': tab === 'base' }"
        :aria-pressed="tab === 'base'"
        @click="tab = 'base'"
      >
        {{ t('checklists.baseTab') }}
      </button>
      <button
        type="button"
        class="segmented__item"
        :class="{ 'segmented__item--active': tab === 'sets' }"
        :aria-pressed="tab === 'sets'"
        @click="tab = 'sets'"
      >
        {{ t('checklists.setsTab') }}
      </button>
    </div>

    <template v-if="tab === 'mine'">
      <p class="hint">{{ t('checklists.mineHint') }}</p>

      <AppButton variant="filled" block @click="openAddTask">
        {{ t('checklists.addTask') }}
      </AppButton>

      <p v-if="!ownTasks.length" class="empty">{{ t('checklists.emptyMine') }}</p>

      <ul v-else class="list">
        <li v-for="task in ownTasks" :key="task.id" class="row">
          <div class="row__body">
            <p class="row__title">{{ task.title }}</p>
            <p class="row__hint">{{ hintOf(task) }}</p>
          </div>

          <button
            type="button"
            class="row__action"
            :aria-label="t('checklists.editTask')"
            @click="editing = task"
          >
            <i class="pi pi-pencil" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="row__action row__action--danger"
            :aria-label="t('checklists.removeTask')"
            @click="remove(task)"
          >
            <i class="pi pi-trash" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </template>

    <template v-else-if="tab === 'base'">
      <p class="hint">{{ t('checklists.baseHint') }}</p>

      <p v-if="!baseTasks.length" class="empty">{{ t('checklists.emptyBase') }}</p>

      <ul v-else class="list">
        <li v-for="task in baseTasks" :key="task.id" class="row">
          <div class="row__body">
            <p class="row__title">{{ task.title }}</p>
            <p class="row__hint">{{ hintOf(task) }}</p>
          </div>

          <button
            type="button"
            class="row__action"
            :aria-label="t('checklists.editTask')"
            @click="editing = task"
          >
            <i class="pi pi-pencil" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="row__action row__action--danger"
            :aria-label="t('checklists.removeTask')"
            @click="remove(task)"
          >
            <i class="pi pi-trash" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </template>

    <template v-else>
      <p class="hint">{{ t('checklists.setsHint') }}</p>
      <p v-if="added" class="notice">{{ added }}</p>

      <ul class="list list--cards">
        <li v-for="template in templates" :key="template.id" class="card">
          <h2 class="card__title">{{ template.title }}</h2>
          <p class="card__meta">{{ template.items_count }} {{ itemsLabel(template.items_count) }}</p>
          <p v-if="template.description" class="card__text">{{ template.description }}</p>

          <AppButton
            variant="filled"
            block
            :disabled="adding === template.id"
            @click="addSet(template)"
          >
            {{ t('checklists.addSet') }}
          </AppButton>
        </li>
      </ul>
    </template>

    <TaskEditSheet
      :open="editing !== null"
      :task="editSource"
      :pending="editPending"
      :error="editError"
      @close="editing = null"
      @save="saveEdit"
    />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.page__title {
  font-size: var(--fs-display);
}

.segmented {
  display: flex;
  gap: var(--space-1);
  padding: 4px;
  border-radius: var(--r-pill);
  background: var(--c-surface-sunken);
}

.segmented__item {
  flex: 1;
  min-height: var(--tap-min);
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
}

.segmented__item--active {
  background: var(--c-surface);
  color: var(--c-brand);
  font-weight: 600;
}

.hint,
.empty {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.notice {
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

@media (min-width: 768px) {
  .list--cards {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
  }
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
}

.row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row__title {
  font-size: var(--fs-body);
}

.row__hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.row__action {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  flex: 0 0 var(--tap-min);
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
}

.row__action:hover {
  color: var(--c-brand);
}

.row__action--danger:hover {
  color: var(--c-danger);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.card__title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.card__meta,
.card__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}
</style>
