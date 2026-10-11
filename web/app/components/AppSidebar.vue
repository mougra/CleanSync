<script setup lang="ts">
import { appNavItems } from '~/composables/useAppNav';

const { t } = useI18n();
const route = useRoute();

const isActive = (to: string) =>
  to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(`${to}/`);
</script>

<template>
  <aside class="sidebar">
    <NuxtLink to="/" class="sidebar__brand">
      <span class="sidebar__mark">
        <img class="sidebar__logo" src="/logo.svg" alt="" width="36" height="36" >
      </span>
      <span class="sidebar__name">TidyPlan</span>
    </NuxtLink>

    <nav class="sidebar__nav" aria-label="TidyPlan">
      <NuxtLink
        v-for="item in appNavItems"
        :key="item.key"
        :to="item.to"
        class="sidebar__item"
        :class="{ 'sidebar__item--active': isActive(item.to) }"
      >
        <i :class="['pi', item.icon]" aria-hidden="true" />
        <span>{{ t(`nav.${item.key}`) }}</span>
      </NuxtLink>
    </nav>

    <!--
      Приглашение для гостя — между навигацией и аккаунтом: место постоянное,
      заметное и не занимает поток страницы. Показывается один раз, закрытие
      запоминается (см. useGuestInvite).
    -->
    <GuestInvite variant="sidebar" />

    <div class="sidebar__footer">
      <AppSidebarProfile />
      <div class="sidebar__controls">
        <ThemeToggle />
        <LocaleSwitch />
      </div>
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
    background: var(--c-bg);
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
</style>
