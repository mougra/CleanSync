<script setup lang="ts">
/**
 * Статья-совет: рендер Markdown из @nuxt/content + разметка для SEO
 * (og-теги и schema.org Article).
 */
const { t, locale } = useI18n();
const localePath = useLocalePath();
const route = useRoute();

const slug = String(route.params.slug);

const { data: article } = await useAsyncData(`tip-${slug}`, () =>
  queryCollection('tips').path(`/tips/${slug}`).first(),
);

if (!article.value) {
  throw createError({ statusCode: 404, statusMessage: t('tipsPage.notFound'), fatal: true });
}

const publishedLabel = computed(() => {
  const value = article.value?.publishedAt;

  return value
    ? new Intl.DateTimeFormat(locale.value, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(fromISODate(value.slice(0, 10)))
    : '';
});

useSeoMeta({
  title: () => article.value?.title,
  description: () => article.value?.description,
  ogType: 'article',
  ogImage: () => article.value?.cover,
  articlePublishedTime: () => article.value?.publishedAt,
});

useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: computed(() =>
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: article.value?.title,
          description: article.value?.description,
          image: article.value?.cover,
          datePublished: article.value?.publishedAt,
          inLanguage: 'ru-RU',
        }),
      ),
    },
  ],
});
</script>

<template>
  <article v-if="article" class="article">
    <NuxtLink :to="localePath('/tips')" class="back">
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('tipsPage.all') }}
    </NuxtLink>

    <img class="hero" :src="article.cover" :alt="article.title" >

    <AppBadge>{{ t(`tipsPage.category.${article.category}`) }}</AppBadge>
    <h1 class="title">{{ article.title }}</h1>
    <p class="lead">{{ article.description }}</p>
    <p class="meta">{{ publishedLabel }} · {{ article.minutes }} {{ t('tipsPage.minutes') }}</p>

    <div class="prose">
      <ContentRenderer :value="article" />
    </div>

    <AppButton variant="outline" block :to="localePath('/tips')">{{ t('tipsPage.all') }}</AppButton>
  </article>
</template>

<style scoped>
.article {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}

.back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  color: var(--c-text);
  text-decoration: none;
}

.back:hover {
  color: var(--c-brand);
}

.hero {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: var(--r-card);
  background: var(--c-surface-sunken);
}

.title {
  font-size: var(--fs-display);
  line-height: var(--lh-tight);
}

.lead {
  color: var(--c-text-muted);
}

.meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.prose {
  margin-top: var(--space-2);
}
</style>
