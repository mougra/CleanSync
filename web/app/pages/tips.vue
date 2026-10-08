<script setup lang="ts">
/**
 * «Советы» — статьи-инсайты. Источник контента — MDX в git через @nuxt/content
 * (решение из docs/PLAN.md §0), модуль подключим в Фазе 5. Тогда же появятся
 * страницы /tips/<slug>, sitemap и разметка Article/HowTo для SEO.
 */
const { t } = useI18n();

useSeoMeta({
  title: () => t('nav.tips'),
  description: () =>
    'Как почистить стиральную машину, убрать кухню и навести порядок — практические советы по домашней уборке.',
});
</script>

<template>
  <div class="page">
    <section class="card">
      <h2 class="card__title">{{ t('nav.tips') }}</h2>
      <p class="card__text">
        Раздел статей: пошаговые советы с фото, привязанные к челленджам и чек-листам.
        Контент будет лежать в Markdown прямо в репозитории, чтобы страницы отдавались
        сервером и индексировались поиском.
      </p>
      <NuxtLink to="/" class="btn">{{ t('nav.today') }}</NuxtLink>
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
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-5);
  border-radius: var(--r-card);
  background: var(--c-surface-task);
}

.card__title {
  font-size: var(--fs-title);
}

.card__text {
  color: var(--c-text-muted);
}

.btn {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border-radius: var(--r-pill);
  background: var(--c-brand);
  color: var(--c-onbrand);
  font-weight: 600;
  text-decoration: none;
}
</style>
