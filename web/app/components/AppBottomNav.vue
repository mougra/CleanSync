<script setup lang="ts">
import { bottomNavItems, appPath } from '~/composables/useAppNav';

const { t } = useI18n();
const route = useRoute();
const localePath = useLocalePath();

/** Ссылки — через `localePath`, иначе с `/en/...` человек падал на русский адрес. */
const isActive = (to: string) => {
  const path = appPath(route.path);

  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
};
</script>

<template>
  <nav class="bottom-nav" :aria-label="t('nav.today')">
    <NuxtLink
      v-for="item in bottomNavItems"
      :key="item.key"
      :to="localePath(item.to)"
      class="bottom-nav__item"
      :class="{ 'bottom-nav__item--active': isActive(item.to) }"
    >
      <i :class="['pi', item.icon]" aria-hidden="true" />
      <span class="bottom-nav__label">{{ t(`nav.${item.key}`) }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
/* Мобильная нижняя навигация из макетов: 5 пунктов, иконка + подпись. */
.bottom-nav {
  position: fixed;
  inset: auto 0 0;
  z-index: 20;
  display: flex;
  justify-content: space-around;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-2) calc(var(--space-2) + env(safe-area-inset-bottom));
  background: var(--c-bg);
  border-top: 1px solid var(--c-border);
}

.bottom-nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1 1 0;
  min-height: var(--tap-min);
  justify-content: center;
  padding: 2px 0;
  border-radius: var(--r-chip);
  color: var(--c-text-muted);
  text-decoration: none;
  font-size: 0.6875rem;
  transition: color 0.15s ease;
}

.bottom-nav__item .pi {
  font-size: 1.25rem;
}

.bottom-nav__item--active {
  color: var(--c-text);
  font-weight: 600;
}

@media (min-width: 768px) {
  .bottom-nav {
    display: none;
  }
}
</style>
