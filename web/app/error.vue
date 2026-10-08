<script setup lang="ts">
/**
 * Своя страница ошибок: 404 для неизвестных адресов и 500 для сбоев.
 * Тексты через i18n, оформление — на токенах дизайн-системы.
 */
import type { NuxtError } from '#app';

const props = defineProps<{ error: NuxtError }>();
const { t } = useI18n();
const localePath = useLocalePath();

const isNotFound = computed(() => props.error.statusCode === 404);

useSeoMeta({
  title: () => (isNotFound.value ? t('error.notFoundTitle') : t('error.serverTitle')),
  robots: 'noindex',
});
</script>

<template>
  <div class="error">
    <p class="error__code">{{ error.statusCode }}</p>
    <h1 class="error__title">
      {{ isNotFound ? t('error.notFoundTitle') : t('error.serverTitle') }}
    </h1>
    <p class="error__text">
      {{ isNotFound ? t('error.notFoundText') : t('error.serverText') }}
    </p>

    <div class="error__actions">
      <AppButton variant="filled" :to="localePath('/')">{{ t('error.home') }}</AppButton>
      <AppButton variant="outline" :to="localePath('/tips')">{{ t('nav.tips') }}</AppButton>
    </div>
  </div>
</template>

<style scoped>
.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  max-width: 480px;
  margin: 0 auto;
  padding: var(--space-7) var(--space-4);
  text-align: center;
}

.error__code {
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
  color: var(--c-brand);
}

.error__title {
  font-size: var(--fs-title);
}

.error__text {
  color: var(--c-text-muted);
}

.error__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
</style>
