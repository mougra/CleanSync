<script setup lang="ts">
/** Настройки: тема, язык и профиль. Авторизация — httpOnly-cookie. */
const { t } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
// Не деструктурируем: preference — пара геттер/сеттер, деструктуризация ломает запись.
const colorMode = useColorMode();

const themeOptions = [
  { value: 'light', icon: 'pi-sun', label: 'settings.themeLight' },
  { value: 'dark', icon: 'pi-moon', label: 'settings.themeDark' },
  { value: 'system', icon: 'pi-desktop', label: 'settings.themeSystem' },
] as const;

const logout = async () => {
  await auth.logout();
  clearNuxtData(['today-plan', 'achievements-earned']);
  await navigateTo(localePath('/'));
};

useSeoMeta({ title: () => t('nav.settings') });
</script>

<template>
  <div class="page">
    <section class="card">
      <h2 class="card__title">{{ t('settings.appearance') }}</h2>

      <div class="field">
        <span class="field__label">{{ t('settings.theme') }}</span>
        <div class="segmented" role="group" :aria-label="t('settings.theme')">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            class="segmented__item"
            :class="{ 'segmented__item--active': colorMode.preference === option.value }"
            :aria-pressed="colorMode.preference === option.value"
            @click="colorMode.preference = option.value"
          >
            <i :class="['pi', option.icon]" aria-hidden="true" />
            {{ t(option.label) }}
          </button>
        </div>
      </div>

      <div class="field">
        <span class="field__label">{{ t('settings.language') }}</span>
        <LocaleSwitch />
      </div>
    </section>

    <section class="card">
      <h2 class="card__title">{{ t('auth.profile') }}</h2>

      <template v-if="auth.isAuthenticated">
        <p class="card__text">{{ auth.user?.email }}</p>
        <button type="button" class="btn" @click="logout">
          <i class="pi pi-sign-out" aria-hidden="true" />
          {{ t('auth.logout') }}
        </button>
      </template>

      <template v-else>
        <p class="card__text">{{ t('auth.guestHint') }}</p>
        <div class="actions">
          <NuxtLink :to="localePath('/login')" class="btn">
            {{ t('auth.login') }}
          </NuxtLink>
          <NuxtLink :to="localePath('/register')" class="btn btn--ghost">
            {{ t('auth.register') }}
          </NuxtLink>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
}

.card__title {
  font-size: var(--fs-title);
}

.card__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.segmented {
  display: flex;
  gap: var(--space-1);
  padding: 4px;
  border-radius: var(--r-pill);
  background: var(--c-bg);
}

.segmented__item {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--tap-min);
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  cursor: pointer;
}

.segmented__item--active {
  background: var(--c-surface);
  color: var(--c-brand);
  font-weight: 600;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-brand);
  color: var(--c-onbrand);
  font: inherit;
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.btn--ghost {
  background: transparent;
  border: 1.5px solid var(--c-brand);
  color: var(--c-brand);
}
</style>
