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
  articleModifiedTime: () => article.value?.updatedAt ?? article.value?.publishedAt,
  // Unhead ждёт строку: массив в meta keywords превращался в одну последнюю фразу
  keywords: () => (article.value?.keywords ?? []).join(', '),
});

const site = useSiteConfig();
const absolute = (path: string) => (path.startsWith('http') ? path : `${site.url}${path}`);

/**
 * Микроразметка статьи: автор, даты и обложка — то, что поисковики и модели
 * читают в первую очередь. Раньше здесь был рукописный JSON-LD без автора,
 * без даты обновления и с относительной картинкой.
 */
defineArticle({
  headline: computed(() => article.value?.title ?? ''),
  description: computed(() => article.value?.description ?? ''),
  image: computed(() => absolute(String(article.value?.cover ?? ''))),
  datePublished: computed(() => article.value?.publishedAt ?? ''),
  dateModified: computed(() => article.value?.updatedAt ?? article.value?.publishedAt ?? ''),
  inLanguage: 'ru-RU',
  author: [{ name: 'Команда Clean Planner', url: `${site.url}/about` }],
  publisher: { name: 'Clean Planner' },
  about: computed(() => (article.value?.keywords ?? []).join(', ')),
  mainEntityOfPage: computed(() => `${site.url}/tips/${slug}`),
});

defineBreadcrumb({
  itemListElement: computed(() => [
    { name: t('nav.today'), item: '/' },
    { name: t('nav.tips'), item: '/tips' },
    { name: String(article.value?.title ?? ''), item: `/tips/${slug}` },
  ]),
});

// Вопросы из front-matter отдаём как FAQPage: шанс попасть в расширенную выдачу
const faq = computed(() => article.value?.faq ?? []);

if (faq.value.length > 0) {
  for (const item of faq.value) {
    defineQuestion({ name: item.question, acceptedAnswer: item.answer });
  }
}
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

    <!-- Частые вопросы: те же данные уходят в разметку FAQPage -->
    <section v-if="faq.length" class="faq">
      <h2 class="faq__title">{{ t('tipsPage.faqTitle') }}</h2>
      <dl class="faq__list">
        <div v-for="(item, index) in faq" :key="index" class="faq__item">
          <dt class="faq__question">{{ item.question }}</dt>
          <dd class="faq__answer">{{ item.answer }}</dd>
        </div>
      </dl>
    </section>

    <!-- Перелинковка: статья ведёт в чек-листы и челленджи, а не в тупик -->
    <aside class="next">
      <p class="next__title">{{ t('tipsPage.nextTitle') }}</p>
      <div class="next__links">
        <NuxtLink :to="localePath('/checklists')" class="next__link">
          <i class="pi pi-list-check" aria-hidden="true" />
          {{ t('nav.checklists') }}
        </NuxtLink>
        <NuxtLink :to="localePath('/challenges')" class="next__link">
          <i class="pi pi-flag" aria-hidden="true" />
          {{ t('challengesPage.title') }}
        </NuxtLink>
        <NuxtLink :to="localePath('/about')" class="next__link">
          <i class="pi pi-info-circle" aria-hidden="true" />
          {{ t('aboutPage.title') }}
        </NuxtLink>
      </div>
    </aside>

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

/* Частые вопросы статьи */
.faq {
  width: 100%;
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.faq__title {
  font-size: var(--fs-body);
  font-weight: 600;
  margin-bottom: var(--space-3);
}

.faq__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
}

.faq__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.faq__question {
  font-weight: 600;
}

.faq__answer {
  margin: 0;
  color: var(--c-text-muted);
}

/* Куда пойти дальше */
.next {
  width: 100%;
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
}

.next__title {
  margin-bottom: var(--space-2);
  font-weight: 600;
}

.next__links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.next__link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text);
  font-size: var(--fs-caption);
  text-decoration: none;
}

.next__link:hover {
  color: var(--c-brand);
}
</style>
