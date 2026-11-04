<script setup lang="ts">
import { appNavItems, appPath } from '~/composables/useAppNav';

const { t } = useI18n();
const route = useRoute();
const localePath = useLocalePath();

/**
 * Установка приложения прямо из меню.
 *
 * Строка в настройках остаётся главной точкой входа (там же инструкция для
 * iOS), но искать её в настройках ради иконки на рабочем столе — лишний путь.
 *
 * Кнопка видна всегда, кроме случая, когда приложение уже открыто как
 * установленное: `beforeinstallprompt` браузер присылает не всегда (например,
 * если PWA уже стоит или Chrome ещё не считает страницу устанавливаемой), и
 * прятать иконку из-за этого — значит вообще лишить человека входа. Если
 * отложенного события нет, клик показывает короткую подсказку, а не молчит.
 */
const {
  canInstall: installCanInstall,
  isInstalled: installIsInstalled,
  install: installApp,
} = useInstallPrompt();

/**
 * Подсказка под кнопкой: почему установка не началась.
 *
 * Кнопка видна всегда — заказчик просил именно иконку в меню, а не строку,
 * которая появляется по событию браузера. Если установить нельзя, клик честно
 * объясняет причину, а не молчит.
 */
const installHint = ref<'' | 'installed' | 'unavailable'>('');

const requestInstall = async () => {
  installHint.value = '';

  if (installCanInstall.value) {
    await installApp();
    return;
  }

  installHint.value = installIsInstalled.value ? 'installed' : 'unavailable';
};

const installHintText = computed(() =>
  installHint.value === 'installed'
    ? t('settings.installDone')
    : t('settings.installUnavailable'),
);

/**
 * Ссылки собираем через `localePath`: в английской версии адреса живут под `/en`,
 * а сырой `/habits` — это русский маршрут. Переход по нему переключал язык
 * обратно на русский, хотя человек только что выбрал английский.
 */
const isActive = (to: string) => {
  const path = appPath(route.path);

  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
};
</script>

<template>
  <aside class="sidebar">
    <NuxtLink :to="localePath('/')" class="sidebar__brand">
      <span class="sidebar__mark">
        <img class="sidebar__logo" src="/logo.svg" alt="" width="36" height="36" >
      </span>
      <span class="sidebar__name">TidyPlan</span>
    </NuxtLink>

    <!--
      Слоган переехал сюда с главной: на странице он занимал первый экран и
      ничего не объяснял, а под логотипом читается как подпись бренда.
    -->
    <p class="sidebar__tagline">{{ t('home.tagline') }}</p>

    <nav class="sidebar__nav" aria-label="TidyPlan">
      <NuxtLink
        v-for="item in appNavItems"
        :key="item.key"
        :to="localePath(item.to)"
        class="sidebar__item"
        :class="{ 'sidebar__item--active': isActive(item.to) }"
      >
        <i :class="['pi', item.icon]" aria-hidden="true" />
        <span>{{ t(`nav.${item.key}`) }}</span>
      </NuxtLink>
    </nav>

    <div class="sidebar__footer">
      <AppSidebarProfile />
      <div class="sidebar__controls">
        <ThemeToggle />
        <LocaleSwitch />
      </div>

      <!--
        Иконка без подписи: полное название — в подсказке и `aria-label`. Видна
        всегда: `beforeinstallprompt` браузер присылает не всегда (PWA уже стоит,
        Chrome ещё не считает страницу устанавливаемой), и прятать из-за этого
        кнопку — значит не показывать её никогда. Если установить нельзя, клик
        честно объясняет причину под кнопкой.
      -->
      <button
        type="button"
        class="sidebar__install"
        :title="t('settings.installApp')"
        :aria-label="t('settings.installApp')"
        @click="requestInstall"
      >
        <i class="pi pi-download" aria-hidden="true" />
      </button>

      <p v-if="installHint" class="sidebar__install-hint" role="status">
        {{ installHintText }}
      </p>
    </div>
  </aside>
</template>

<style scoped>
/* Десктопная раскладка: боковое меню вместо нижней навигации. */
.sidebar {
  display: none;
}

@media (min-width: 768px) {
  .sidebar {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    width: var(--sidebar-w);
    flex: 0 0 var(--sidebar-w);
    height: 100vh;
    padding: var(--space-5) var(--space-4);
    border-right: 1px solid var(--c-border);
    /*
     * Панель просвечивает: фон приложения (decor.css, п. 7) проходит под меню,
     * и левая колонка не выглядит плоской заплатой на градиенте. Плотность
     * подобрана так, чтобы подписи пунктов не теряли контраст.
     */
    background: var(--c-sidebar-bg);
  }
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  text-decoration: none;
  color: var(--c-text);
}

.sidebar__mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--r-pill);
  /* Мятная подложка: знак тёмно-зелёный, и на тёмной теме без неё пропадёт */
  background: var(--c-surface-mint);
  color: var(--c-brand);
}

.sidebar__logo {
  width: 30px;
  height: 30px;
}

.sidebar__name {
  font-weight: 700;
}

/*
 * Подпись бренда под логотипом. Отступ сверху отрицательный: `.sidebar` даёт
 * `gap: var(--space-5)` между детьми, и без этого слоган отрывался бы от
 * названия на полсотни пикселей, читаясь как отдельный блок.
 */
.sidebar__tagline {
  margin: calc(var(--space-4) * -1) 0 0;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  line-height: 1.35;
}

.sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.sidebar__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border-radius: var(--r-chip);
  color: var(--c-text-muted);
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.sidebar__item:hover {
  background: var(--c-surface-sunken);
  color: var(--c-text);
}

.sidebar__item--active {
  background: var(--c-surface-mint);
  color: var(--c-brand);
  font-weight: 600;
}

.sidebar__footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.sidebar__controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/*
 * Установка приложения: круглая иконка под переключателями темы и языка. Тот же
 * размер, что у кнопок управления, но без подписи — `pi-download` понятен сам,
 * а полное название показывает подсказка (`title`).
 */
.sidebar__install {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text);
  font-size: 1rem;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.sidebar__install:hover {
  background: var(--c-surface-sunken);
  color: var(--c-brand);
}

/* Подсказка, когда браузер не предложил установку: короткая и в колонке меню */
.sidebar__install-hint {
  margin: calc(var(--space-2) * -1) 0 0;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  line-height: 1.35;
}
</style>
