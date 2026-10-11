<script setup lang="ts">
/**
 * Шелл приложения: на мобильном — нижняя навигация и FAB, на десктопе — боковое меню.
 * Календарная полоса недели показывается на «дневных» разделах и скрывается
 * на «Советах» и в «Настройках».
 */
const route = useRoute();

const hideCalendarRoutes = ['/tips', '/settings'];
const showCalendar = computed(() => !hideCalendarRoutes.some((path) => route.path.startsWith(path)));
</script>

<template>
  <div class="shell">
    <AppSidebar />

    <div class="shell__main">
      <div class="shell__topbar">
        <NuxtLink to="/" class="shell__brand">
          <span class="shell__mark">
            <img class="shell__logo" src="/logo.svg" alt="" width="32" height="32" >
          </span>
          <span>TidyPlan</span>
        </NuxtLink>
        <div class="shell__controls">
          <ThemeToggle />
          <LocaleSwitch />
        </div>
      </div>

      <WeekStrip v-if="showCalendar" />

      <main class="shell__content">
        <slot />
      </main>

      <!-- Подвал: внутренние ссылки на публичные разделы и справочные страницы -->
      <AppFooter />

      <AppBottomNav />
      <AppFab />

      <!-- Уведомление о новом достижении живёт в раскладке: его может вызвать
           действие на любой странице (задача, привычка, пункт чек-листа). -->
      <AchievementToast />

      <!-- Информирование об использовании cookie: у нас только технически необходимые -->
      <CookieBanner />
    </div>
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  display: flex;
  /*
   * Шелл занимает всю ширину окна: меню слева, остальное пространство отдано
   * контенту. Ограничиваем не колонку целиком, а отдельные блоки внутри страниц
   * (--content-narrow / --content-reading), иначе на широком экране всё
   * растягивается в нечитаемые полосы.
   *
   * Фон намеренно прозрачный: цвет приложения и свечение живут на `body`
   * (см. assets/css/decor.css). Непрозрачный фон здесь закрывал бы свечение —
   * ровно поэтому декор больше не рисуется узлом внутри раскладки.
   */
  min-height: 100vh;
  background: transparent;
  isolation: isolate;
}

.shell__main {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-3) var(--space-4) calc(88px + env(safe-area-inset-bottom));
  width: 100%;
}

.shell__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0 var(--space-2);
}

.shell__brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--c-text);
  font-weight: 700;
  text-decoration: none;
}

.shell__mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--r-pill);
  background: var(--c-surface-mint);
  color: var(--c-brand);
}

.shell__logo {
  width: 26px;
  height: 26px;
}

.shell__controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.shell__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-top: var(--space-2);
}

/* ── Появление блоков ───────────────────────────────────────────────────
 * Блоки всплывают по очереди: интерфейс «оживает» без библиотеки анимаций.
 */
.shell__content > * {
  animation: rise var(--dur-base) var(--ease-out) both;
}

.shell__content > :nth-child(2) { animation-delay: 50ms; }
.shell__content > :nth-child(3) { animation-delay: 100ms; }
.shell__content > :nth-child(4) { animation-delay: 150ms; }
.shell__content > :nth-child(n + 5) { animation-delay: 200ms; }

@keyframes rise {
  from {
    opacity: 0;
    transform: translate3d(0, 12px, 0);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (min-width: 768px) {
  /* Десктоп: больше воздуха по краям, ширину задают сами блоки */
  .shell__main {
    padding: var(--space-6) var(--space-7) var(--space-8);
  }

  /* На десктопе бренд и переключатели живут в боковом меню. */
  .shell__topbar {
    display: none;
  }

  .shell__content {
    gap: var(--space-6);
    padding-top: var(--space-4);
  }
}

/* Кто просил меньше движения — получает статичный интерфейс */
@media (prefers-reduced-motion: reduce) {
  .shell__content > * {
    animation: none !important;
  }
}
</style>
