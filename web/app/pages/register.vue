<script setup lang="ts">
const { t } = useI18n();
const auth = useAuthStore();
const localePath = useLocalePath();

const email = ref('');
const password = ref('');
const pending = ref(false);
const error = ref(false);
const successMessage = ref('');

const submit = async () => {
  pending.value = true;
  error.value = false;
  try {
    // Регистрация не логинит: бэкенд включает «мягкое» подтверждение e-mail
    // и возвращает только сообщение.
    successMessage.value = await auth.register(email.value.trim(), password.value);
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
};

useSeoMeta({ title: () => t('auth.registerTitle') });
</script>

<template>
  <div class="auth">
    <h1 class="auth__title">{{ t('auth.registerTitle') }}</h1>

    <p v-if="successMessage" class="auth__success">{{ successMessage }}</p>

    <form v-else class="auth__form" @submit.prevent="submit">
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
          autocomplete="new-password"
          minlength="8"
          required
        >
      </label>

      <p v-if="error" class="auth__error">{{ t('auth.registerFailed') }}</p>

      <button type="submit" class="btn" :disabled="pending">
        {{ pending ? t('state.loading') : t('auth.register') }}
      </button>
    </form>

    <p class="auth__switch">
      {{ t('auth.haveAccount') }}
      <NuxtLink :to="localePath('/login')">{{ t('auth.login') }}</NuxtLink>
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

.auth__success {
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
  color: var(--c-text);
}

.auth__switch {
  text-align: center;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}
</style>
