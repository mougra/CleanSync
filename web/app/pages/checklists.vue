<script setup lang="ts">
/** Чек-листы: живые данные из /api/templates (проверено на SSR). */
interface ChecklistTemplate {
  title: string;
  items: { id: number; text: string; done: boolean }[];
}

interface TemplatesResponse {
  seasonal: { title: string; desc: string; steps: string[] }[];
  checklist: ChecklistTemplate[];
}

const { t } = useI18n();
const api = useApi();

const { data, error } = await useAsyncData(
  'templates',
  () => api.request<TemplatesResponse>('/api/templates'),
  { default: () => ({ seasonal: [], checklist: [] }) },
);

const checklists = computed(() => data.value?.checklist ?? []);

useSeoMeta({ title: () => t('nav.checklists') });
</script>

<template>
  <div class="page">
    <p v-if="error" class="state state--error">
      {{ t('state.error') }}<br >
      <small>{{ t('state.errorHint') }}</small>
    </p>

    <ul v-else class="list">
      <li v-for="checklist in checklists" :key="checklist.title" class="card">
        <h2 class="card__title">{{ checklist.title }}</h2>
        <p class="card__meta">{{ checklist.items.length }} · {{ t('home.tasks') }}</p>
        <ul class="items">
          <li v-for="item in checklist.items" :key="item.id" class="item">
            <span class="item__check" aria-hidden="true" />
            {{ item.text }}
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.card {
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
}

.card__title {
  font-size: var(--fs-title);
  margin-bottom: var(--space-1);
}

.card__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  margin-bottom: var(--space-3);
}

.items {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface-task);
}

.item__check {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border: 1.5px solid var(--c-brand);
  border-radius: var(--r-pill);
}

.state {
  color: var(--c-text-muted);
}

.state--error {
  color: var(--c-danger);
}
</style>
