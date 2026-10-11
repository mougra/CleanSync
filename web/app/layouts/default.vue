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
          <span class="shell__mark" aria-hidden="true">⚑</span>
          <span>Clean Planner</span>
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
  display: flex;
  min-height: 100vh;
  background: var(--c-bg);
}

.shell__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0 var(--space-4) calc(88px + env(safe-area-inset-bottom));
  max-width: var(--content-max);
  margin: 0 auto;
  width: 100%;
}

.shell__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0 var(--space-1);
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

@media (min-width: 768px) {
  .shell__main {
    padding: 0 var(--space-6) var(--space-6);
    max-width: 960px;
  }

  /* На десктопе бренд и переключатели живут в боковом меню. */
  .shell__topbar {
    display: none;
  }
}
</style>
