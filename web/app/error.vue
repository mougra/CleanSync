<script setup lang="ts">
/**
 * Своя страница ошибок: 404 для неизвестных адресов и 500 для сбоев.
 *
 * Рисуется в общем шелле (`NuxtLayout`): без него человек с битой ссылкой видел
 * пустой экран без навигации и не понимал, куда идти, — а выглядело это так,
 * будто страницы 404 нет вовсе. Тексты через i18n, оформление на токенах,
 * `noindex` — поисковик не должен индексировать ошибку.
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

/**
 * Куда ещё можно уйти с ошибки: только публичные разделы, которые открыты и
 * гостю. Для 500 ссылки не нужны — там важнее перезагрузить страницу.
 */
const places = computed(() =>
  isNotFound.value
    ? [
        { to: localePath('/tips'), label: t('nav.tips') },
        { to: localePath('/zones'), label: t('zonesPage.title') },
        { to: localePath('/habits'), label: t('nav.habits') },
      ]
    : [],
);
</script>

<template>
  <NuxtLayout>
    <section class="error">
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

      <nav v-if="places.length" class="error__places" :aria-label="t('error.popular')">
        <NuxtLink v-for="place in places" :key="place.to" class="error__place" :to="place.to">
          {{ place.label }}
        </NuxtLink>
      </nav>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-7) var(--space-4);
  text-align: center;
}

.error__code {
  font-size: clamp(3rem, 10vw, 4.5rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
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

.error__places {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--c-border);
}

.error__place {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text);
  font-size: var(--fs-caption);
  text-decoration: none;
}

.error__place:hover {
  background: var(--c-surface-sunken);
}
</style>
