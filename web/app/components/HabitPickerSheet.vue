<script setup lang="ts">
/**
 * Лист «Идеи привычек» из макетов: поиск, чипсы категорий, карточки-шаблоны
 * с мультивыбором и кнопка «Добавить выбранные».
 */
import type { HabitCategoryCount, HabitTemplate } from '~/types/habit';

const props = defineProps<{
  open: boolean;
  templates: HabitTemplate[];
  categories: HabitCategoryCount[];
}>();

const emit = defineEmits<{ close: []; added: [] }>();

const { t } = useI18n();
const api = useApi();
const { categoryLabel, intervalLabel } = useHabitLabels();

const query = ref('');
const category = ref('all');
const selected = ref<number[]>([]);
const pending = ref(false);

const filtered = computed(() => {
  const search = query.value.trim().toLowerCase();

  return props.templates.filter((template) => {
    const matchesCategory = category.value === 'all' || template.category === category.value;
    const matchesSearch =
      !search ||
      template.title.toLowerCase().includes(search) ||
      (template.description ?? '').toLowerCase().includes(search);

    return matchesCategory && matchesSearch;
  });
});

const toggle = (id: number) => {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((item) => item !== id)
    : [...selected.value, id];
};

const addSelected = async () => {
  if (selected.value.length === 0 || pending.value) {
    return;
  }

  pending.value = true;
  try {
    for (const templateId of selected.value) {
      await api.request('/api/habits', { method: 'POST', body: { templateId } });
    }
    selected.value = [];
    query.value = '';
    category.value = 'all';
    emit('added');
  } finally {
    pending.value = false;
  }
};

watch(
  () => props.open,
  (open) => {
    if (!open) {
      selected.value = [];
      query.value = '';
      category.value = 'all';
    }
  },
);
</script>

<template>
  <AppSheet :open="open" @close="emit('close')">
    <template #header>
      <div class="ideas">
        <span class="ideas__icon" aria-hidden="true"><i class="pi pi-refresh" /></span>
        <div>
          <h2 class="ideas__title">{{ t('habits.ideasTitle') }}</h2>
          <p class="ideas__subtitle">{{ t('habits.ideasSubtitle') }}</p>
        </div>
      </div>
    </template>

    <div class="picker">
      <label class="search">
        <i class="pi pi-search" aria-hidden="true" />
        <input
          v-model="query"
          class="search__input"
          type="search"
          :placeholder="t('habits.searchPlaceholder')"
        >
      </label>

      <div class="chips">
        <button
          type="button"
          class="chip"
          :class="{ 'chip--active': category === 'all' }"
          @click="category = 'all'"
        >
          {{ t('habitCategory.all') }}
        </button>
        <button
          v-for="item in categories"
          :key="item.category"
          type="button"
          class="chip"
          :class="{ 'chip--active': category === item.category }"
          @click="category = item.category"
        >
          {{ categoryLabel(item.category) }}
        </button>
      </div>

      <p v-if="!filtered.length" class="empty">{{ t('habits.nothingFound') }}</p>

      <ul class="cards">
        <li v-for="template in filtered" :key="template.id">
          <button
            type="button"
            class="card"
            :class="{ 'card--selected': selected.includes(template.id) }"
            :aria-pressed="selected.includes(template.id)"
            @click="toggle(template.id)"
          >
            <span class="card__icon" aria-hidden="true">
              <i :class="['pi', template.icon ?? 'pi-check-circle']" />
            </span>

            <span class="card__body">
              <span class="card__title">{{ template.title }}</span>
              <small class="card__text">{{ template.description }}</small>
              <small class="card__meta">
                {{ categoryLabel(template.category) }} ·
                {{ intervalLabel(template.interval_count, template.interval_unit) }}
              </small>
            </span>

            <span class="card__radio" aria-hidden="true">
              <i v-if="selected.includes(template.id)" class="pi pi-check" />
            </span>
          </button>
        </li>
      </ul>
    </div>

    <template #footer>
      <AppButton
        variant="accent"
        block
        :disabled="selected.length === 0 || pending"
        @click="addSelected"
      >
        {{ t('habits.addSelected') }} ({{ selected.length }})
      </AppButton>
    </template>
  </AppSheet>
</template>

<style scoped>
.ideas {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.ideas__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: var(--r-chip);
  background: var(--c-surface);
  color: var(--c-brand);
}

.ideas__title {
  font-size: var(--fs-title);
}

.ideas__subtitle {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  min-height: 52px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text-muted);
}

.search__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--c-text);
  font: inherit;
  outline: none;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip {
  min-height: 40px;
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
}

.chip--active {
  border-color: transparent;
  background: var(--c-brand);
  color: var(--c-onbrand);
  font-weight: 600;
}

.cards {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.card--selected {
  border-color: var(--c-brand);
  background: var(--c-surface-mint);
}

.card__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: var(--r-chip);
  background: var(--c-surface-mint);
  color: var(--c-brand);
}

.card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.card__title {
  font-weight: 600;
  line-height: 1.3;
}

.card__text,
.card__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.card__radio {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border: 1.5px solid var(--c-track);
  border-radius: var(--r-pill);
  color: var(--c-brand);
  font-size: 0.7rem;
}

.card--selected .card__radio {
  border-color: var(--c-brand);
  background: var(--c-brand);
  color: var(--c-onbrand);
}

.empty {
  color: var(--c-text-muted);
  text-align: center;
  padding: var(--space-5) 0;
}
</style>
