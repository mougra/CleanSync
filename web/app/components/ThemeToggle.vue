<script setup lang="ts">
/**
 * Переключатель темы. Класс на <html> ставит @nuxtjs/color-mode
 * (classSuffix: '' => ровно `dark`).
 *
 * Важно: объект из useColorMode() нельзя деструктурировать — preference
 * реализован парой геттер/сеттер, и деструктуризация ломает запись.
 */
const { t } = useI18n();
const colorMode = useColorMode();

const order = ['light', 'dark', 'system'] as const;
type Mode = (typeof order)[number];

const icons: Record<Mode, string> = {
  light: 'pi-sun',
  dark: 'pi-moon',
  system: 'pi-desktop',
};

const labelKeys: Record<Mode, string> = {
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
  system: 'settings.themeSystem',
};

const current = computed<Mode>(() => {
  const value = colorMode.preference as Mode;
  return order.includes(value) ? value : 'system';
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
