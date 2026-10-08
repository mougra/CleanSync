<script setup lang="ts">
/**
 * Строка задачи из макетов: кружок-чекбокс, заголовок, необязательная подпись
 * и необязательная миниатюра справа. Без `interactive` — просто отображение.
 */
withDefaults(
  defineProps<{
    title: string;
    hint?: string | null;
    imageUrl?: string | null;
    done?: boolean;
    interactive?: boolean;
    disabled?: boolean;
  }>(),
  { done: false, interactive: false, disabled: false, hint: null, imageUrl: null },
);

const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    v-if="interactive"
    type="button"
    class="task"
    :class="{ 'task--done': done }"
    :aria-pressed="done"
    :disabled="disabled"
    @click="emit('toggle')"
  >
    <span class="task__check" aria-hidden="true">
      <i v-if="done" class="pi pi-check" />
    </span>
    <span class="task__text">
      {{ title }}
      <small v-if="hint">{{ hint }}</small>
    </span>
    <img v-if="imageUrl" class="task__thumb" :src="imageUrl" :alt="title" >
  </button>

  <div v-else class="task task--static" :class="{ 'task--done': done }">
    <span class="task__check" aria-hidden="true">
      <i v-if="done" class="pi pi-check" />
    </span>
    <span class="task__text">
      {{ title }}
      <small v-if="hint">{{ hint }}</small>
    </span>
    <img v-if="imageUrl" class="task__thumb" :src="imageUrl" :alt="title" >
  </div>
</template>

<style scoped>
.task {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 64px;
  padding: var(--space-3) var(--space-4);
  border: none;
  border-radius: var(--r-row);
  background: var(--c-surface-task);
  color: var(--c-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.task--static {
  cursor: default;
}

.task:disabled {
  cursor: default;
  opacity: 0.75;
}

.task--done {
  opacity: 0.6;
  text-decoration: line-through;
}

.task__check {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border: 1.5px solid var(--c-brand);
  border-radius: var(--r-pill);
  color: var(--c-brand);
  font-size: 0.75rem;
}

.task__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.task__text small {
  color: var(--c-text-muted);
}

.task__thumb {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border-radius: var(--r-thumb);
  object-fit: cover;
}
</style>
