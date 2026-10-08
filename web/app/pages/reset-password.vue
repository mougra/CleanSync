<script setup lang="ts">
/** Страница из письма: установка нового пароля по токену. */
const { t } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const api = useApi();

const token = computed(() => String(route.query.token ?? ''));
const password = ref('');
const repeat = ref('');
const pending = ref(false);
const done = ref(false);
const error = ref('');

const submit = async () => {
  error.value = '';

  if (password.value !== repeat.value) {
    error.value = t('auth.passwordMismatch');
    return;
  }

  pending.value = true;
  try {
    await api.request('/api/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, newPassword: password.value },
    });
    done.value = true;
  } catch {
    error.value = t('auth.resetFailed');
  } finally {
    pending.value = false;
  }
};

useSeoMeta({ title: () => t('auth.resetTitle'), robots: 'noindex' });
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('auth.resetTitle') }}</h1>

    <template v-if="done">
      <p class="state state--done">{{ t('auth.resetDone') }}</p>
      <AppButton variant="filled" :to="localePath('/login')">{{ t('auth.toLogin') }}</AppButton>
    </template>

    <form v-else class="form" @submit.prevent="submit">
      <label class="field">
        <span class="field__label">{{ t('auth.newPassword') }}</span>
        <input v-model="password" class="field__input" type="password" minlength="8" autocomplete="new-password" required >
      </label>

      <label class="field">
        <span class="field__label">{{ t('auth.passwordRepeat') }}</span>
        <input v-model="repeat" class="field__input" type="password" minlength="8" autocomplete="new-password" required >
      </label>

      <p v-if="error" class="state state--error">{{ error }}</p>

      <AppButton variant="accent" block type="submit" :disabled="pending">
        {{ pending ? t('state.loading') : t('auth.resetSubmit') }}
      </AppButton>
    </form>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 420px;
  margin: 0 auto;
  padding: var(--space-6) 0;
}

.page__title {
  font-size: var(--fs-display);
  text-align: center;
}

.form {
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

.state {
  color: var(--c-text-muted);
}

.state--done {
  color: var(--c-brand);
}

.state--error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}
</style>
