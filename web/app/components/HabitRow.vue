<script setup lang="ts">
/** Строка привычки: кружок-отметка, иконка в мятном квадрате, название и серия. */
withDefaults(
  defineProps<{
    title: string;
    icon?: string;
    done?: boolean;
    meta?: string | null;
    disabled?: boolean;
  }>(),
  { icon: 'pi-check-circle', done: false, meta: null, disabled: false },
);

const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <!--
    Обёртка нужна ради слота действия: у привычки рядом с отметкой живёт «⋯»
    с правкой и удалением. Слот необязательный — без него разметка прежняя.
  -->
  <div class="habit-row">
    <button
      type="button"
      class="habit"
      :class="{ 'habit--done': done }"
      :aria-pressed="done"
      :disabled="disabled"
      @click="emit('toggle')"
    >
      <span class="habit__check" aria-hidden="true">
        <i v-if="done" class="pi pi-check" />
      </span>

      <span class="habit__icon" aria-hidden="true">
        <i :class="['pi', icon]" />
      </span>

      <span class="habit__body">
        <span class="habit__title">{{ title }}</span>
        <small v-if="meta" class="habit__meta">{{ meta }}</small>
      </span>
    </button>

    <div v-if="$slots.actions" class="habit-row__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.habit-row {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
}

.habit-row > .habit {
  flex: 1;
  min-width: 0;
}

.habit-row__actions {
  display: flex;
  align-items: center;
}

.habit {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 72px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.habit:disabled {
  cursor: default;
  opacity: 0.6;
}

.habit--done {
  opacity: 0.55;
}

.habit--done .habit__title {
  text-decoration: line-through;
}

.habit__check {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border: 1.5px solid var(--c-brand);
  border-radius: var(--r-pill);
  color: var(--c-brand);
  font-size: 0.75rem;
}

.habit__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: var(--r-chip);
  background: var(--c-surface-mint);
  color: var(--c-brand);
}

.habit__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.habit__title {
  font-weight: 600;
}

.habit__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}
</style>
