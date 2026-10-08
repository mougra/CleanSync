<script setup lang="ts">
/**
 * Страница из письма: подтверждает почту по токену из ссылки.
 * Запрос идёт с клиента (нужна CSRF-cookie браузера), поэтому в onMounted.
 */
const { t } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const api = useApi();

const token = computed(() => String(route.query.token ?? ''));
const state = ref<'pending' | 'done' | 'error'>('pending');
const reason = ref('');

onMounted(async () => {
  if (!token.value) {
    state.value = 'error';
    reason.value = t('auth.confirmNoToken');
    return;
  }

  try {
    await api.request('/api/auth/confirm-email', {
      method: 'POST',
      body: { token: token.value },
    });
    state.value = 'done';
  } catch {
    state.value = 'error';
    reason.value = t('auth.confirmFailed');
  }
});

useSeoMeta({ title: () => t('auth.confirmTitle'), robots: 'noindex' });
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('auth.confirmTitle') }}</h1>

    <p v-if="state === 'pending'" class="state">{{ t('auth.confirmPending') }}</p>

    <template v-else-if="state === 'done'">
      <p class="state state--done">{{ t('auth.confirmDone') }}</p>
      <AppButton variant="filled" :to="localePath('/login')">{{ t('auth.toLogin') }}</AppButton>
    </template>

    <template v-else>
      <p class="state state--error">{{ reason }}</p>
      <AppButton variant="outline" :to="localePath('/')">{{ t('auth.toHome') }}</AppButton>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  max-width: 420px;
  margin: 0 auto;
  padding: var(--space-6) 0;
  text-align: center;
}

.page__title {
  font-size: var(--fs-display);
}

.state {
  color: var(--c-text-muted);
}

.state--done {
  color: var(--c-brand);
}

.state--error {
  color: var(--c-danger);
}
</style>
