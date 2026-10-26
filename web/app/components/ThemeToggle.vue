<script setup lang="ts">
/**
 * Переключатель темы: только светлая и тёмная, без «как в системе».
 * Класс на <html> ставит @nuxtjs/color-mode (classSuffix: '' => ровно `dark`).
 *
 * Иконка, подпись и title зависят от `preference`, поэтому он обязан совпадать
 * на сервере и в браузере. Это обеспечено настройкой модуля
 * (`storage: 'cookie'` в nuxt.config): серверный плагин модуля читает тот же
 * cookie, что и инлайновый скрипт, и SSR рисует уже выбранную тему, а не
 * дефолтную тёмную. Делать разметку клиентской (<ClientOnly>) не нужно —
 * переключатель остаётся в серверном HTML.
 *
 * Важно: объект из useColorMode() нельзя деструктурировать — preference
 * реализован парой геттер/сеттер, и деструктуризация ломает запись.
 */
const { t } = useI18n();
const colorMode = useColorMode();

const order = ['light', 'dark'] as const;
type Mode = (typeof order)[number];

const icons: Record<Mode, string> = {
  light: 'pi-sun',
  dark: 'pi-moon',
};

const labelKeys: Record<Mode, string> = {
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
};

const current = computed<Mode>(() => {
  const value = colorMode.preference as Mode;
  return order.includes(value) ? value : 'dark';
});

const nextMode = computed<Mode>(() => order[(order.indexOf(current.value) + 1) % order.length]!);

const cycle = () => {
  colorMode.preference = nextMode.value;
};
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :title="`${t('settings.theme')}: ${t(labelKeys[current])} → ${t(labelKeys[nextMode])}`"
    :aria-label="`${t('settings.theme')}: ${t(labelKeys[current])}`"
    @click="cycle"
  >
    <i :class="['pi', icons[current]]" aria-hidden="true" />
    <span class="theme-toggle__label">{{ t(labelKeys[current]) }}</span>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.theme-toggle:hover {
  background: var(--c-surface-sunken);
}

.theme-toggle__label {
  font-size: var(--fs-caption);
}
</style>
