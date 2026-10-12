<script setup lang="ts">
/**
 * Уведомление «Задача удалена» с кнопкой «Вернуть».
 *
 * Появляется после удаления строки из плана на сегодня и живёт несколько секунд
 * (TASK_UNDO_MS): за это время человек либо возвращает задачу, либо оно само
 * уходит и задача остаётся удалённой. Состояние (что именно можно вернуть) лежит
 * в `useTaskUndo` — уведомление только показывает его, поэтому кнопка всегда
 * возвращает ту задачу, о которой говорит.
 */
const { t } = useI18n();
const { pending, restoring, error, restore, dismiss } = useTaskUndo();

let timer: ReturnType<typeof setTimeout> | null = null;

const stopTimer = () => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};

/**
 * Отсчёт начинается заново на каждое удаление: если человек убрал вторую строку,
 * пока висело первое уведомление, время на «Вернуть» получает именно вторая.
 */
watch(pending, (value) => {
  stopTimer();

  if (value && import.meta.client) {
    timer = setTimeout(() => {
      timer = null;
      dismiss();
    }, TASK_UNDO_MS);
  }
});

onUnmounted(stopTimer);

const undo = async () => {
  stopTimer();
  await restore();
};
</script>

<template>
  <Transition name="toast">
    <div v-if="pending" class="undo" role="status" aria-live="polite">
      <span class="undo__icon" aria-hidden="true"><i class="pi pi-trash" /></span>

      <div class="undo__body">
        <strong class="undo__title">{{ t('plan.deletedTitle') }}</strong>
        <span class="undo__task">{{ pending.task.title }}</span>
        <small v-if="error" class="undo__error">{{ error }}</small>
      </div>

      <button type="button" class="undo__action" :disabled="restoring" @click="undo">
        {{ t('plan.undo') }}
      </button>

      <button
        type="button"
        class="undo__close"
        :aria-label="t('common.close')"
        @click="dismiss"
      >
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.undo {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
  box-shadow: 0 10px 30px rgb(0 0 0 / 18%);
}

.undo__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: var(--r-chip);
  background: var(--c-surface-sunken);
  color: var(--c-text-muted);
}

.undo__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.undo__title {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.undo__task {
  font-weight: 600;
}

.undo__error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}

.undo__action {
  flex: 0 0 auto;
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-brand);
  color: var(--c-onbrand);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.undo__action:disabled {
  opacity: 0.6;
  cursor: default;
}

.undo__close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
}
</style>
