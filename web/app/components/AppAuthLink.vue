<script setup lang="ts">
/** Компактная ссылка на вход / кнопка выхода для бокового меню. */
const { t } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();

const logout = async () => {
  await auth.logout();
  clearNuxtData(['today-plan', 'achievements-earned', 'active-challenge', 'challenges-active', 'households']);
  await navigateTo(localePath('/'));
};
</script>

<template>
  <div class="auth-link">
    <template v-if="auth.isAuthenticated">
      <span class="auth-link__email" :title="auth.user?.email">{{ auth.user?.email }}</span>
      <button type="button" class="auth-link__action" @click="logout">
        <i class="pi pi-sign-out" aria-hidden="true" />
        <span>{{ t('auth.logout') }}</span>
      </button>
    </template>

    <NuxtLink v-else :to="localePath('/login')" class="auth-link__action">
      <i class="pi pi-sign-in" aria-hidden="true" />
      <span>{{ t('auth.login') }}</span>
    </NuxtLink>
  </div>
</template>

<style scoped>
.auth-link {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.auth-link__email {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auth-link__action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  font-size: var(--fs-caption);
  text-decoration: none;
  cursor: pointer;
}

.auth-link__action:hover {
  background: var(--c-surface-sunken);
}
</style>
