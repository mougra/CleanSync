<script setup lang="ts">
/**
 * «Советы»: список статей из @nuxt/content (web/content/tips/*.md).
 * Контент лежит в git, страницы рендерятся на сервере и индексируются.
 */
const { t, locale } = useI18n();
const localePath = useLocalePath();

const { data: articles } = await useAsyncData('tips-list', () =>
  queryCollection('tips').order('order', 'ASC').all(),
);

const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(locale.value, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(fromISODate(value.slice(0, 10)))
    : '';

useSeoMeta({
  title: () => t('nav.tips'),
  description: () => t('tipsPage.lead'),
});
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('nav.tips') }}</h1>
    <p class="page__lead">{{ t('tipsPage.lead') }}</p>

    <p v-if="locale !== 'ru'" class="notice">{{ t('tipsPage.ruOnly') }}</p>

    <ul class="list">
      <li v-for="article in articles" :key="article.path">
        <NuxtLink :to="localePath(article.path)" class="card">
          <img class="card__image" :src="article.cover" :alt="article.title" loading="lazy" >

          <div class="card__body">
            <AppBadge>{{ t(`tipsPage.category.${article.category}`) }}</AppBadge>
            <h2 class="card__title">{{ article.title }}</h2>
            <p class="card__text">{{ article.description }}</p>
            <p class="card__meta">
              {{ formatDate(article.publishedAt) }} · {{ article.minutes }} {{ t('tipsPage.minutes') }}
            </p>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.page__title {
  font-size: var(--fs-display);
}

.page__lead {
  color: var(--c-text-muted);
  margin-bottom: var(--space-2);
}

.notice {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface-warm);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--r-card);
  background: var(--c-surface);
  color: var(--c-text);
  text-decoration: none;
}

.card:hover .card__title {
  color: var(--c-brand);
}

.card__image {
  width: 100%;
  height: 156px;
  object-fit: cover;
  background: var(--c-surface-sunken);
}

.card__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-4);
}

.card__title {
  font-size: var(--fs-title);
  line-height: var(--lh-tight);
}

.card__text,
.card__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}
</style>
