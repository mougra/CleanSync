<script setup lang="ts">
/**
 * Контакты.
 *
 * Публичная страница с почтой проекта: нужна и людям, и поисковикам —
 * «как связаться» повышает доверие к сайту. Почта та же, с которой уходят
 * письма сервиса, поэтому отдельного ящика заводить не нужно.
 */
const { t } = useI18n();
const localePath = useLocalePath();

const SUPPORT_EMAIL = 'tidyflowup@gmail.com';

const topics = ['support', 'ideas', 'data'] as const;
const site = useSiteConfig();

useStructuredData(() => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ContactPage',
      '@id': `${site.url}/contacts#page`,
      name: t('contactsPage.title'),
      description: t('contactsPage.description'),
      inLanguage: 'ru-RU',
    },
    {
      '@type': 'Organization',
      '@id': `${site.url}/#organization`,
      name: 'Clean Planner',
      url: site.url,
      email: SUPPORT_EMAIL,
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: SUPPORT_EMAIL,
        availableLanguage: ['ru', 'en'],
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('nav.today'), item: `${site.url}/` },
        { '@type': 'ListItem', position: 2, name: t('contactsPage.title'), item: `${site.url}/contacts` },
      ],
    },
  ],
}));

useSeoMeta({
  title: () => t('contactsPage.title'),
  description: () => t('contactsPage.description'),
  ogTitle: () => t('contactsPage.title'),
  ogDescription: () => t('contactsPage.description'),
});
</script>

<template>
  <article class="contacts">
    <NuxtLink :to="localePath('/')" class="contacts__back">
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('nav.today') }}
    </NuxtLink>

    <h1 class="contacts__title">{{ t('contactsPage.title') }}</h1>
    <p class="contacts__lead">{{ t('contactsPage.lead') }}</p>

    <a class="contacts__email" :href="`mailto:${SUPPORT_EMAIL}`">
      <i class="pi pi-envelope" aria-hidden="true" />
      {{ SUPPORT_EMAIL }}
    </a>

    <section class="contacts__topics">
      <h2 class="contacts__heading">{{ t('contactsPage.topicsTitle') }}</h2>
      <ul class="contacts__list">
        <li v-for="key in topics" :key="key" class="contacts__item">
          <strong>{{ t(`contactsPage.${key}Title`) }}</strong>
          <span>{{ t(`contactsPage.${key}Body`) }}</span>
        </li>
      </ul>
    </section>

    <p class="contacts__note">{{ t('contactsPage.note') }}</p>

    <nav class="contacts__links">
      <NuxtLink :to="localePath('/faq')" class="contacts__link">{{ t('faqPage.title') }}</NuxtLink>
      <NuxtLink :to="localePath('/privacy')" class="contacts__link">{{ t('settings.privacy') }}</NuxtLink>
      <NuxtLink :to="localePath('/about')" class="contacts__link">{{ t('aboutPage.title') }}</NuxtLink>
    </nav>
  </article>
</template>

<style scoped>
.contacts {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}

.contacts__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  min-height: var(--tap-min);
  color: var(--c-text);
  text-decoration: none;
}

.contacts__back:hover {
  color: var(--c-brand);
}

.contacts__title {
  font-size: var(--fs-display);
}

.contacts__lead {
  color: var(--c-text-muted);
}

.contacts__email {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  align-self: flex-start;
  min-height: 56px;
  padding: 0 var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface-mint);
  color: var(--c-brand);
  font-weight: 600;
  text-decoration: none;
}

.contacts__topics {
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.contacts__heading {
  font-size: var(--fs-body);
  font-weight: 600;
  margin-bottom: var(--space-3);
}

.contacts__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.contacts__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.contacts__item span {
  color: var(--c-text-muted);
}

.contacts__note {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.contacts__links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.contacts__link {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  color: var(--c-text);
  text-decoration: none;
}

.contacts__link:hover {
  border-color: var(--c-brand);
  color: var(--c-brand);
}
</style>
