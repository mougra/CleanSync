<script setup lang="ts">
/**
 * Юридические документы из web/content/legal/*.md.
 * Реквизиты оператора берутся из front-matter: их заполняют перед публикацией.
 */
const { t, locale } = useI18n();
const route = useRoute();
const localePath = useLocalePath();

const slug = String(route.params.slug ?? 'privacy');

const { data: doc } = await useAsyncData(`legal-${slug}`, () =>
  queryCollection('legal').path(`/legal/${slug}`).first(),
);

if (!doc.value) {
  throw createError({ statusCode: 404, statusMessage: t('legal.notFound'), fatal: true });
}

const updatedLabel = computed(() =>
  doc.value
    ? new Intl.DateTimeFormat(locale.value, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(fromISODate(doc.value.updatedAt.slice(0, 10)))
    : '',
);

useSeoMeta({
  title: () => doc.value?.title,
  description: () => doc.value?.description,
  robots: 'index, follow',
});
</script>

<template>
  <article v-if="doc" class="article">
    <NuxtLink :to="localePath('/')" class="back">
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('error.home') }}
    </NuxtLink>

    <h1 class="title">{{ doc.title }}</h1>
    <p class="lead">{{ doc.description }}</p>
    <p class="meta">{{ t('legal.updatedAt') }}: {{ updatedLabel }}</p>

    <p v-if="locale !== 'ru'" class="notice">{{ t('legal.ruOnly') }}</p>

    <!-- Реквизиты оператора: заполняются в front-matter документа -->
    <section class="requisites">
      <h2 class="requisites__title">{{ t('legal.operator') }}</h2>
      <dl class="requisites__list">
        <div class="requisites__row">
          <dt>{{ t('legal.status') }}</dt>
          <dd>{{ doc.operator.status }}</dd>
        </div>
        <div class="requisites__row">
          <dt>{{ t('legal.name') }}</dt>
          <dd>{{ doc.operator.name }}</dd>
        </div>
        <div class="requisites__row">
          <dt>{{ t('legal.inn') }}</dt>
          <dd>{{ doc.operator.inn }}</dd>
        </div>
        <div class="requisites__row">
          <dt>{{ t('legal.email') }}</dt>
          <dd>{{ doc.operator.email }}</dd>
        </div>
        <div class="requisites__row">
          <dt>{{ t('legal.address') }}</dt>
          <dd>{{ doc.operator.address }}</dd>
        </div>
      </dl>
    </section>

    <div class="prose">
      <ContentRenderer :value="doc" />
    </div>
  </article>
</template>

<style scoped>
.article {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}

.back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  min-height: var(--tap-min);
  color: var(--c-text);
  text-decoration: none;
}

.back:hover {
  color: var(--c-brand);
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

.notice {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface-warm);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.requisites {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
}

.requisites__title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.requisites__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
}

.requisites__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.requisites__row dt {
  flex: 0 0 40%;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.requisites__row dd {
  flex: 1;
  margin: 0;
  min-width: 0;
}

.prose {
  margin-top: var(--space-2);
}
</style>
