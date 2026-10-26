<script setup lang="ts">
/**
 * Шелл приложения: на мобильном — нижняя навигация и FAB, на десктопе — боковое меню.
 *
 * Календарь недели — часть **главной**, а не общий элемент раскладки. Раньше он
 * показывался везде, кроме «Советов» и «Настроек», и висел без дела на привычках,
 * чек-листах и статистике: выбирать день там нечего. Заказчик попросил оставить его
 * только на главной; в семейном режиме это будет решаться отдельно, когда станет
 * понятно, нужен ли там общий день.
 */
import { appPath } from '~/composables/useAppNav';

const route = useRoute();

/**
 * Календарь показываем только на «Сегодня». Английская версия живёт под `/en`,
 * поэтому перед сравнением префикс снимаем (`appPath`) — иначе на `/en`
 * календарь исчез бы.
 */
const showCalendar = computed(() => appPath(route.path) === '/');
</script>

<template>
  <div class="shell">
    <AppSidebar />

    <div class="shell__main">
      <!--
        Верхняя панель с брендом и переключателями на мобильном убрана:
        тема и язык переехали в настройки, а логотип показывается только
        в заставке при запуске (AppBootSplash). На десктопе бренд живёт
        в сайдбаре, поэтому отдельная панель не нужна нигде.
      -->

      <!--
        Календарь недели: числа выбирают день, а карточка плана на главной
        показывает план этого дня — всплывающих панелей у календаря нет.
      -->
      <WeekStrip v-if="showCalendar" />

      <main class="shell__content">
        <slot />
      </main>

      <!-- Подвал: внутренние ссылки на публичные разделы и справочные страницы -->
      <AppFooter />

      <AppBottomNav />
      <AppFab />

      <!--
        Плавающие уведомления живут в раскладке: их может вызвать действие на
        любой странице (задача, привычка, пункт чек-листа), а место на экране у
        них общее — «новое достижение» и «задача удалена» не должны накладываться
        друг на друга (FloatingNotifications).
      -->
      <FloatingNotifications />

      <!-- Информирование об использовании cookie: у нас только технически необходимые -->
      <CookieBanner />

      <!--
        Логотип только при запуске приложения: на мобильном это единственное
        место, где он виден, дальше экран отдан контенту.
      -->
      <AppBootSplash />
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
  padding: var(--space-4) var(--space-4) calc(88px + env(safe-area-inset-bottom));
  width: 100%;
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
