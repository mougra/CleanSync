<script setup lang="ts">
/**
 * Всплывающая карточка «Новое достижение». Показывает очередь по одной,
 * каждая закрывается сама через несколько секунд или по нажатию.
 */
const { t } = useI18n();
const { queue, dismiss } = useAchievementToast();

const current = computed(() => queue.value[0] ?? null);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(current, (item) => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  if (item) {
    timer = setTimeout(() => dismiss(item.code), 6000);
  }
});

onUnmounted(() => {
  if (timer) {
    clearTimeout(timer);
  }
});
</script>

<template>
  <Transition name="toast">
    <div v-if="current" class="toast" role="status" aria-live="polite">
      <span class="toast__icon" aria-hidden="true"><i :class="['pi', current.icon]" /></span>

      <div class="toast__body">
        <strong class="toast__title">{{ t('achievements.toastTitle') }}</strong>
        <span class="toast__name">{{ current.name }}</span>
        <small v-if="current.description" class="toast__text">{{ current.description }}</small>
      </div>

      <button
        type="button"
        class="toast__close"
        :aria-label="t('common.close')"
        @click="dismiss(current.code)"
      >
        <i class="pi pi-times" aria-hidden="true" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: var(--space-4);
  right: var(--space-4);
  /* Над кнопкой «+», чтобы уведомление не ложилось на неё и не липло к низу */
  bottom: calc(var(--nav-height) + var(--space-7) + env(safe-area-inset-bottom));
  z-index: 60;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
  box-shadow: 0 10px 30px rgb(0 0 0 / 18%);
}

.toast__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: var(--r-chip);
  background: var(--c-surface);
  color: var(--c-brand);
  font-size: 1.125rem;
}

.toast__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.toast__title {
  color: var(--c-brand);
  font-size: var(--fs-caption);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.toast__name {
  font-weight: 600;
}

.toast__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.toast__close {
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

@media (min-width: 768px) {
  .toast {
    left: auto;
    right: var(--space-5);
    bottom: var(--space-5);
    max-width: 380px;
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
