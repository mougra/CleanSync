<script setup lang="ts">
/**
 * Круглая кнопка «+» из макетов: открывает лист «Добавить задачу».
 *
 * Гостю форма недоступна — его отправляем на вход, поэтому шторка живёт здесь
 * же: кнопка и лист всегда ходят парой. Состояние открытия общее с пустым
 * планом дня на главной (`useTaskSheet`), иначе «+» в плане пришлось бы
 * заводить вторую такую же шторку.
 */
const { t } = useI18n();
const { open, openSheet, closeSheet } = useTaskSheet();

/** После создания задачи обновляем план дня на главной — он в кэше под ключом 'today-plan'. */
const afterCreated = async () => {
  closeSheet();
  await refreshNuxtData('today-plan');
};
</script>

<template>
  <div class="fab">
    <button
      type="button"
      class="fab__button"
      :aria-expanded="open"
      :aria-label="t('tasks.openSheet')"
      @click="openSheet"
    >
      <i class="pi pi-plus" aria-hidden="true" />
    </button>

    <TaskCreateSheet :open="open" @close="closeSheet" @created="afterCreated" />
  </div>
</template>

<style scoped>
.fab {
  position: fixed;
  right: var(--space-4);
  bottom: calc(72px + env(safe-area-inset-bottom));
  z-index: 25;
}

.fab__button {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-brand);
  color: var(--c-onbrand);
  font-size: 1.25rem;
  cursor: pointer;
  box-shadow: var(--shadow-fab);
  transition:
    background-color var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}

.fab__button:hover {
  background: var(--c-brand-hover);
}

.fab__button:active {
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .fab__button {
    transition: none;
  }

  .fab__button:active {
    transform: none;
  }
}

@media (min-width: 768px) {
  .fab {
    bottom: var(--space-5);
  }
}
</style>
