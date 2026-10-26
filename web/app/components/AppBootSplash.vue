<script setup lang="ts">
/**
 * Заставка запуска: логотип и название на долю секунды при старте приложения.
 *
 * Зачем: на мобильном логотип убран из верхней панели, а тема и язык переехали
 * в настройки — экран начинается сразу с содержимого. Заставка оставляет бренду
 * одно уместное место: момент, когда приложение открывается. Показываем один раз
 * за сессию (`sessionStorage`), поэтому при переходах внутри приложения её нет.
 *
 * Только мобильный: на десктопе логотип и так живёт в боковом меню.
 */
const SPLASH_KEY = 'tidyplan-boot-splash';
const SPLASH_MS = 900;

const visible = ref(false);
let timer: number | undefined;

onMounted(() => {
  if (sessionStorage.getItem(SPLASH_KEY)) {
    return;
  }

  sessionStorage.setItem(SPLASH_KEY, '1');
  visible.value = true;
  timer = window.setTimeout(() => {
    visible.value = false;
  }, SPLASH_MS);
});

onBeforeUnmount(() => {
  if (timer !== undefined) {
    window.clearTimeout(timer);
  }
});
</script>

<template>
  <Transition name="boot">
    <div v-if="visible" class="boot" aria-hidden="true">
      <span class="boot__mark">
        <img class="boot__logo" src="/logo.svg" alt="" width="56" height="56" >
      </span>
      <span class="boot__name">TidyPlan</span>
    </div>
  </Transition>
</template>

<style scoped>
.boot {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-3);
  background: var(--c-bg);
}

/* На десктопе заставка не нужна: бренд уже в сайдбаре. */
@media (min-width: 768px) {
  .boot {
    display: none;
  }
}

.boot__mark {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
  box-shadow: var(--shadow-card);
}

.boot__logo {
  width: 56px;
  height: 56px;
}

.boot__name {
  color: var(--c-brand);
  font-size: var(--fs-title);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.boot-enter-active,
.boot-leave-active {
  transition: opacity var(--dur-base) var(--ease-out);
}

.boot-enter-from,
.boot-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .boot-enter-active,
  .boot-leave-active {
    transition: none;
  }
}
</style>
