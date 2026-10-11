<script setup lang="ts">
/** Страница из письма: установка нового пароля по токену. */
const MIN_PASSWORD = 8;

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
const touchedRepeat = ref(false);

/** Требования к паролю проверяем до отправки: сервер ответит тем же, но позже. */
const tooShort = computed(() => password.value.length < MIN_PASSWORD);
const mismatch = computed(() => password.value !== repeat.value);
const canSubmit = computed(() => !tooShort.value && !mismatch.value && repeat.value.length > 0);

const repeatError = computed(() => (touchedRepeat.value && repeat.value.length > 0 && mismatch.value
  ? t('auth.passwordMismatch')
  : ''));

const submit = async () => {
  error.value = '';
  touchedRepeat.value = true;

  if (tooShort.value) {
    error.value = t('auth.passwordTooShort');
    return;
  }

  if (mismatch.value) {
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
      <PasswordField
        v-model="password"
        :label="t('auth.newPassword')"
        autocomplete="new-password"
        :minlength="MIN_PASSWORD"
        :hint="t('auth.passwordMinHint')"
        required
      />

      <PasswordField
        v-model="repeat"
        :label="t('auth.passwordRepeat')"
        autocomplete="new-password"
        :minlength="MIN_PASSWORD"
        :error="repeatError"
        required
        @focus="touchedRepeat = true"
      />

      <p v-if="error" class="state state--error" role="alert">{{ error }}</p>

      <AppButton variant="accent" block type="submit" :disabled="pending || !canSubmit">
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
