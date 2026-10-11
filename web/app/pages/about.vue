<script setup lang="ts">
/**
 * О проекте.
 *
 * Страница для доверия (E-E-A-T): кто делает, на чём основаны советы и как
 * устроен сервис. Поисковики и модели любят такие страницы — по ним видно,
 * что за сайтом стоит живой проект, а не набор сгенерированных текстов.
 */
const { t } = useI18n();
const localePath = useLocalePath();

const sections = ['why', 'how', 'principles', 'who'] as const;

defineBreadcrumb({
  itemListElement: [
    { name: t('nav.today'), item: '/' },
    { name: t('aboutPage.title'), item: '/about' },
  ],
});

defineWebPage({
  name: t('aboutPage.title'),
  description: t('aboutPage.description'),
});

useSeoMeta({
  title: () => t('aboutPage.title'),
  description: () => t('aboutPage.description'),
  ogTitle: () => t('aboutPage.title'),
  ogDescription: () => t('aboutPage.description'),
});
</script>

<template>
  <article class="about">
    <NuxtLink :to="localePath('/')" class="about__back">
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('nav.today') }}
    </NuxtLink>

    <h1 class="about__title">{{ t('aboutPage.title') }}</h1>
    <p class="about__lead">{{ t('aboutPage.lead') }}</p>

    <section v-for="key in sections" :key="key" class="about__section">
      <h2 class="about__heading">{{ t(`aboutPage.${key}Title`) }}</h2>
      <p class="about__text">{{ t(`aboutPage.${key}Body`) }}</p>
    </section>

    <nav class="about__links">
      <NuxtLink :to="localePath('/tips')" class="about__link">{{ t('nav.tips') }}</NuxtLink>
      <NuxtLink :to="localePath('/checklists')" class="about__link">{{ t('nav.checklists') }}</NuxtLink>
      <NuxtLink :to="localePath('/challenges')" class="about__link">{{ t('nav.habits') }}</NuxtLink>
      <NuxtLink :to="localePath('/faq')" class="about__link">{{ t('faqPage.title') }}</NuxtLink>
      <NuxtLink :to="localePath('/contacts')" class="about__link">{{ t('contactsPage.title') }}</NuxtLink>
    </nav>
  </article>
</template>

<style scoped>
.about {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}

.about__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  min-height: var(--tap-min);
  color: var(--c-text);
  text-decoration: none;
}

.about__back:hover {
  color: var(--c-brand);
}

.about__title {
  font-size: var(--fs-display);
}

.about__lead {
  color: var(--c-text-muted);
}

.about__section {
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.about__heading {
  font-size: var(--fs-body);
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.about__text {
  color: var(--c-text-muted);
}

.about__links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.about__link {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  color: var(--c-text);
  text-decoration: none;
}

.about__link:hover {
  border-color: var(--c-brand);
  color: var(--c-brand);
}
</style>
