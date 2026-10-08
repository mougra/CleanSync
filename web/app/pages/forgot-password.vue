<script setup lang="ts">
/** Запрос ссылки для сброса пароля: ответ всегда одинаковый (не раскрываем базу). */
const { t } = useI18n();
const localePath = useLocalePath();
const api = useApi();

const email = ref('');
const pending = ref(false);
const sent = ref(false);

const submit = async () => {
  pending.value = true;
  try {
    await api.request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value.trim() },
    });
  } finally {
    // Ошибку не показываем специально: иначе можно перебором узнать,
    // какие адреса зарегистрированы.
    sent.value = true;
    pending.value = false;
  }
};

useSeoMeta({ title: () => t('auth.forgotTitle'), robots: 'noindex' });
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('auth.forgotTitle') }}</h1>

    <p v-if="sent" class="state state--done">{{ t('auth.forgotSent') }}</p>

    <template v-else>
      <p class="state">{{ t('auth.forgotHint') }}</p>

      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span class="field__label">{{ t('auth.email') }}</span>
          <input v-model="email" class="field__input" type="email" autocomplete="email" required >
        </label>

        <AppButton variant="accent" block type="submit" :disabled="pending">
          {{ pending ? t('state.loading') : t('auth.forgotSubmit') }}
        </AppButton>
      </form>
    </template>

    <NuxtLink :to="localePath('/login')" class="back">{{ t('auth.toLogin') }}</NuxtLink>
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
  font-size: var(--fs-caption);
}

.state--done {
  color: var(--c-brand);
}

.back {
  align-self: center;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}
</style>
