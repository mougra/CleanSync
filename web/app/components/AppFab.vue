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

/**
 * Подсказка у кнопки: «+» оказался неочевидным — его не замечали и не понимали,
 * что он делает. Тултип показываем по наведению и по фокусу, текстом из
 * `tasks.openSheet` («Добавить задачу»), а `aria-label` у кнопки уже есть.
 */
const hint = ref(false);

/** После создания задачи обновляем план дня и открытый день календаря. */
const afterCreated = async () => {
  closeSheet();
  await refreshNuxtData(['today-plan', 'calendar-day', 'calendar-week']);
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
      @mouseenter="hint = true"
      @mouseleave="hint = false"
      @focus="hint = true"
      @blur="hint = false"
    >
      <i class="pi pi-plus" aria-hidden="true" />
    </button>

    <Transition name="fab-tip">
      <span v-if="hint" class="fab__tip" role="tooltip">{{ t('tasks.openSheet') }}</span>
    </Transition>

    <TaskCreateSheet :open="open" @close="closeSheet" @created="afterCreated" />
  </div>
</template>

<style scoped>
.fab {
  position: fixed;
  right: var(--space-4);
  /* Выше нижней навигации с запасом: вплотную к ней кнопка выглядела прижатой */
  bottom: calc(var(--nav-height) + var(--space-5) + env(safe-area-inset-bottom));
  z-index: 25;
}

/* Подсказка слева от кнопки: справа край экрана */
.fab__tip {
  position: absolute;
  top: 50%;
  right: calc(100% + var(--space-2));
  padding: 6px var(--space-3);
  border-radius: var(--r-chip);
  background: var(--c-text);
  color: var(--c-bg);
  box-shadow: var(--shadow-lift);
  font-size: var(--fs-caption);
  font-weight: 600;
  line-height: var(--lh-tight);
  white-space: nowrap;
  transform: translateY(-50%);
  pointer-events: none;
}

.fab-tip-enter-active,
.fab-tip-leave-active {
  transition: opacity var(--dur-fast) var(--ease-out);
}

.fab-tip-enter-from,
.fab-tip-leave-to {
  opacity: 0;
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
  /*
   * Нижней навигации на десктопе нет, поэтому формула другая — но и здесь кнопка
   * не должна липнуть к краю: 24px выглядели прижатыми, берём «десктопный» шаг.
   */
  .fab {
    bottom: var(--space-7);
  }
}
</style>
