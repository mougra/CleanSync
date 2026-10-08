<script setup lang="ts">
/**
 * Карточка челленджа: активная (с прогрессом и текущим днём) или доступная
 * для старта. Обе ведут на экран челленджа.
 */
withDefaults(
  defineProps<{
    title: string;
    description?: string | null;
    to: string;
    progress?: { done: number; total: number; percent: number; currentDay?: number | null; minutesLeft?: number } | null;
    badgeLabel: string;
    /** Необязательная строка-пояснение под прогрессом (например, текущий день). */
    note?: string | null;
  }>(),
  { description: null, progress: null, note: null },
);
</script>

<template>
  <NuxtLink :to="to" class="card">
    <div class="card__head">
      <AppBadge :dot="Boolean(progress)" :icon="progress ? undefined : 'pi-flag'">
        {{ badgeLabel }}
      </AppBadge>
      <span class="card__art" aria-hidden="true">⚑</span>
    </div>

    <h2 class="card__title">{{ title }}</h2>

    <template v-if="progress">
      <ProgressBar :value="progress.percent" />
      <p class="card__meta">
        {{ progress.done }} / {{ progress.total }} · {{ progress.percent }}%
      </p>
      <p v-if="note" class="card__text">{{ note }}</p>
    </template>
    <p v-else-if="description" class="card__text">{{ description }}</p>
  </NuxtLink>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
  color: var(--c-text);
  text-decoration: none;
}

.card:hover {
  background: var(--c-surface-sunken);
}

.card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.card__art {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--r-thumb);
  background: var(--c-surface);
  color: var(--c-brand);
  font-size: 1.5rem;
}

.card__title {
  font-size: var(--fs-title);
}

.card__text,
.card__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}
</style>
