<script setup lang="ts">
/**
 * «Советы»: список статей из @nuxt/content (web/content/tips/*.md)
 * с фильтром по категориям. Выбранная категория живёт в query-параметре,
 * чтобы ссылкой можно было поделиться.
 */
const { t, locale } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const router = useRouter();

const { data: articles } = await useAsyncData('tips-list', () =>
  queryCollection('tips').order('order', 'ASC').all(),
);

const category = ref(typeof route.query.category === 'string' ? route.query.category : 'all');

const categories = computed(() => {
  const counts = new Map<string, number>();

  for (const article of articles.value ?? []) {
    counts.set(article.category, (counts.get(article.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([code, total]) => ({ code, total }))
    .sort((a, b) => a.code.localeCompare(b.code));
});

const filtered = computed(() =>
  (articles.value ?? []).filter(
    (article) => category.value === 'all' || article.category === category.value,
  ),
);

const select = (code: string) => {
  category.value = code;
  router.replace({ query: code === 'all' ? {} : { category: code } });
};

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

    <div class="chips">
      <button
        type="button"
        class="chip"
        :class="{ 'chip--active': category === 'all' }"
        @click="select('all')"
      >
        {{ t('tipsPage.allCategories') }}
      </button>
      <button
        v-for="item in categories"
        :key="item.code"
        type="button"
        class="chip"
        :class="{ 'chip--active': category === item.code }"
        @click="select(item.code)"
      >
        {{ t(`tipsPage.category.${item.code}`) }}
        <span class="chip__count">{{ item.total }}</span>
      </button>
    </div>

    <p v-if="!filtered.length" class="notice">{{ t('tipsPage.nothingFound') }}</p>

    <ul class="list">
      <li v-for="article in filtered" :key="article.path">
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
}

.notice {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface-warm);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: var(--space-2) 0;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
}

.chip--active {
  border-color: transparent;
  background: var(--c-brand);
  color: var(--c-onbrand);
  font-weight: 600;
}

.chip__count {
  opacity: 0.6;
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
