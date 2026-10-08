<script setup lang="ts">
const { t } = useI18n();
const auth = useAuthStore();
const localePath = useLocalePath();

const email = ref('');
const password = ref('');
const pending = ref(false);
const error = ref(false);

const submit = async () => {
  pending.value = true;
  error.value = false;
  try {
    await auth.login(email.value.trim(), password.value);
    // Сбрасываем кеш страниц: после входа план дня, достижения и челлендж должны перечитаться.
    clearNuxtData(['today-plan', 'achievements-earned', 'active-challenge']);
    await navigateTo(localePath('/'));
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
};

useSeoMeta({ title: () => t('auth.loginTitle') });
</script>

<template>
  <div class="auth">
    <h1 class="auth__title">{{ t('auth.loginTitle') }}</h1>

    <form class="auth__form" @submit.prevent="submit">
      <label class="field">
        <span class="field__label">{{ t('auth.email') }}</span>
        <input
          v-model="email"
          class="field__input"
          type="email"
          autocomplete="email"
          required
        >
      </label>

      <label class="field">
        <span class="field__label">{{ t('auth.password') }}</span>
        <input
          v-model="password"
          class="field__input"
          type="password"
          autocomplete="current-password"
          required
        >
      </label>

      <p v-if="error" class="auth__error">{{ t('auth.loginFailed') }}</p>

      <button type="submit" class="btn" :disabled="pending">
        {{ pending ? t('state.loading') : t('auth.login') }}
      </button>
    </form>

    <NuxtLink :to="localePath('/forgot-password')" class="auth__forgot">
      {{ t('auth.forgot') }}
    </NuxtLink>

    <p class="auth__switch">
      {{ t('auth.noAccount') }}
      <NuxtLink :to="localePath('/register')">{{ t('auth.register') }}</NuxtLink>
    </p>
  </div>
</template>

<style scoped>
.auth {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-6) 0;
  max-width: 420px;
  margin: 0 auto;
  width: 100%;
}

.auth__title {
  font-size: var(--fs-display);
  text-align: center;
}

.auth__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
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

.field__input {
  min-height: 52px;
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
}

.field__input:focus-visible {
  outline: 2px solid var(--c-brand);
  outline-offset: 1px;
}

.btn {
  min-height: 52px;
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-accent);
  color: var(--c-text-on-accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.auth__error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}

.auth__switch {
  text-align: center;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.auth__forgot {
  align-self: center;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
