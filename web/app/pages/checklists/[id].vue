<script setup lang="ts">
/**
 * Один список: пункты с отметками, добавление и удаление.
 *
 * Для чек-листа из шаблона достаточно названия пункта; для своего списка
 * доступны повтор, день недели, время и зона — это те же задачи, что видит
 * экран «Сегодня».
 */
import type { ChecklistItem, TaskFrequency } from '~/types/checklist';

const { t, locale } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const api = useApi();
const { show: showAchievements } = useAchievementToast();

const id = Number(route.params.id);

const { data: checklist, refresh, error } = await useChecklist(id);

if (!checklist.value && !error.value) {
  throw createError({ statusCode: 404, statusMessage: t('checklists.notFound'), fatal: true });
}

const isChecklist = computed(() => checklist.value?.source_template_id !== null);
const busy = ref<number | null>(null);
const adding = ref(false);
const detailsOpen = ref(false);

const newItem = ref('');
const frequency = ref<TaskFrequency>('once');
const dayOfWeek = ref<number>(new Date().getDay());
const time = ref('');
const minutes = ref<number | null>(null);
const room = ref('');

const items = computed<ChecklistItem[]>(() => checklist.value?.items ?? []);
const done = computed(() => items.value.filter((item) => item.done).length);
const total = computed(() => items.value.length);
const percent = computed(() => (total.value === 0 ? 0 : Math.round((done.value / total.value) * 100)));

const frequencies: TaskFrequency[] = ['once', 'daily', 'weekly', 'monthly'];

const frequencyLabel = (value: TaskFrequency | string | null) =>
  t(
    `checklists.frequency${String(value ?? 'once')
      .charAt(0)
      .toUpperCase()}${String(value ?? 'once').slice(1)}`,
  );

/** Подписи дней недели берём из Intl — как в полосе недели. */
const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2024, 0, 7 + index); // 7 января 2024 — воскресенье
    return {
      value: index,
      label: new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(date),
    };
  }),
);

const itemMeta = (item: ChecklistItem) =>
  [item.room, item.estimated_minutes ? `${item.estimated_minutes} ${t('checklists.minutes')}` : null]
    .filter(Boolean)
    .join(' · ');

const toggle = async (item: ChecklistItem) => {
  busy.value = item.id;
  try {
    const response = await api.request<{ awarded?: string[] }>(`/api/tasks/${item.id}`, {
      method: 'PUT',
      body: { is_completed: !item.done },
    });
    await refresh();
    await showAchievements(response?.awarded);
    await refreshNuxtData('achievements-progress');
  } finally {
    busy.value = null;
  }
};

const addItem = async () => {
  if (!newItem.value.trim() || adding.value) {
    return;
  }

  adding.value = true;
  try {
    await api.request('/api/tasks', {
      method: 'POST',
      body: {
        schedule_id: id,
        title: newItem.value.trim(),
        room: room.value.trim() || null,
        estimated_minutes: minutes.value ?? 0,
        // Повтор и день недели нужны только своим задачам.
        frequency: isChecklist.value ? null : frequency.value,
        day_of_week: !isChecklist.value && frequency.value === 'weekly' ? dayOfWeek.value : null,
        time: !isChecklist.value && time.value ? time.value : null,
      },
    });
    newItem.value = '';
    minutes.value = null;
    room.value = '';
    time.value = '';
    await refresh();
  } finally {
    adding.value = false;
  }
};

const removeItem = async (item: ChecklistItem) => {
  busy.value = item.id;
  try {
    await api.request(`/api/tasks/${item.id}`, { method: 'DELETE' });
    await refresh();
  } finally {
    busy.value = null;
  }
};

const removeList = async () => {
  if (!window.confirm(t('checklists.deleteConfirm'))) {
    return;
  }

  await api.request(`/api/checklists/${id}`, { method: 'DELETE' });
  clearNuxtData(['checklists-mine', 'own-schedules']);
  await navigateTo(localePath('/checklists'));
};

useSeoMeta({
  title: () => checklist.value?.title ?? t('nav.checklists'),
  robots: 'noindex',
});
</script>

<template>
  <div class="page">
    <NuxtLink :to="localePath('/checklists')" class="back">
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('checklists.back') }}
    </NuxtLink>

    <section class="head">
      <div class="head__row">
        <h1 class="head__title">{{ checklist?.title }}</h1>
        <button type="button" class="head__delete" :aria-label="t('checklists.delete')" @click="removeList">
          <i class="pi pi-trash" aria-hidden="true" />
        </button>
      </div>

      <AppBadge :variant="isChecklist ? 'mint' : 'amber'">
        {{ isChecklist ? t('checklists.kindChecklist') : t('checklists.kindSchedule') }}
      </AppBadge>

      <p v-if="checklist?.description" class="head__text">{{ checklist.description }}</p>

      <ProgressBar :value="percent" />
      <p class="head__progress">
        {{ t('checklists.progress', { done, total }) }}
        <span v-if="total > 0 && done === total"> · {{ t('checklists.allDone') }}</span>
      </p>
    </section>

    <form class="add" @submit.prevent="addItem">
      <div class="add__row">
        <input
          v-model="newItem"
          class="add__input"
          type="text"
          maxlength="200"
          :placeholder="t('checklists.addItemPlaceholder')"
        >
        <AppButton variant="filled" type="submit" :disabled="!newItem.trim() || adding">
          <i class="pi pi-plus" aria-hidden="true" />
        </AppButton>
      </div>

      <!-- Свои задачи умеют повторяться: раскрываем подробности по желанию -->
      <button
        v-if="!isChecklist"
        type="button"
        class="add__toggle"
        @click="detailsOpen = !detailsOpen"
      >
        <i :class="['pi', detailsOpen ? 'pi-chevron-up' : 'pi-chevron-down']" aria-hidden="true" />
        {{ t('checklists.details') }}
      </button>

      <div v-if="!isChecklist && detailsOpen" class="fields">
        <label class="field">
          <span class="field__label">{{ t('checklists.frequency') }}</span>
          <select v-model="frequency" class="field__input">
            <option v-for="option in frequencies" :key="option" :value="option">
              {{ frequencyLabel(option) }}
            </option>
          </select>
        </label>

        <label v-if="frequency === 'weekly'" class="field">
          <span class="field__label">{{ t('checklists.dayOfWeek') }}</span>
          <select v-model.number="dayOfWeek" class="field__input">
            <option v-for="day in weekdays" :key="day.value" :value="day.value">
              {{ day.label }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">{{ t('checklists.time') }}</span>
          <input v-model="time" class="field__input" type="time" >
        </label>

        <label class="field">
          <span class="field__label">{{ t('checklists.minutes') }}</span>
          <input v-model.number="minutes" class="field__input" type="number" min="0" max="600" step="5" >
        </label>

        <label class="field">
          <span class="field__label">{{ t('checklists.room') }}</span>
          <input v-model="room" class="field__input" type="text" maxlength="120" >
        </label>
      </div>
    </form>

    <p v-if="!items.length" class="hint">{{ t('checklists.empty') }}</p>

    <ul v-else class="list">
      <li v-for="item in items" :key="item.id" class="item">
        <TaskRow
          :title="item.text"
          :hint="itemMeta(item) || null"
          :done="item.done"
          interactive
          :disabled="busy !== null"
          @toggle="toggle(item)"
        />
        <button
          type="button"
          class="item__remove"
          :aria-label="t('checklists.delete')"
          :disabled="busy !== null"
          @click="removeItem(item)"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-bottom: var(--space-4);
}

.back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  min-height: var(--tap-min);
  color: var(--c-text);
  text-decoration: none;
}

.back:hover {
  color: var(--c-brand);
}

.head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}

.head__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
}

.head__title {
  font-size: var(--fs-display);
  line-height: var(--lh-tight);
}

.head__delete {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
}

.head__delete:hover {
  color: var(--c-danger);
}

.head__text,
.head__progress {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.add {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.add__row {
  display: flex;
  gap: var(--space-2);
}

.add__input {
  flex: 1;
  min-width: 0;
  min-height: 52px;
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
}

.add__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  min-height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface-mint);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.field__input {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-chip);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
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
  /* Десктоп: пункты чек-листа в две колонки — как карточки в «Советах» */
  .list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.item > :first-child {
  flex: 1;
  min-width: 0;
}

.item__remove {
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

.item__remove:hover {
  color: var(--c-danger);
}

.hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}
</style>
