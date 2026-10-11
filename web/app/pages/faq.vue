<script setup lang="ts">
/**
 * Частые вопросы.
 *
 * Каждый вопрос отдаём в микроразметке FAQPage (`defineQuestion`): поисковики
 * показывают такие блоки прямо в выдаче, а модели берут ответы отсюда.
 */
const { t } = useI18n();
const localePath = useLocalePath();

const total = 10;

const items = Array.from({ length: total }, (_, index) => index + 1);

for (const index of items) {
  defineQuestion({
    name: t(`faqPage.q${index}`),
    acceptedAnswer: t(`faqPage.a${index}`),
  });
}

defineBreadcrumb({
  itemListElement: [
    { name: t('nav.today'), item: '/' },
    { name: t('faqPage.title'), item: '/faq' },
  ],
});

useSeoMeta({
  title: () => t('faqPage.title'),
  description: () => t('faqPage.description'),
  ogTitle: () => t('faqPage.title'),
  ogDescription: () => t('faqPage.description'),
});

// Ссылку на страницу кладём в разметку как «страница вопросов сайта»
defineWebPage({
  name: t('faqPage.title'),
  description: t('faqPage.description'),
});
</script>

<template>
  <article class="faq">
    <NuxtLink :to="localePath('/')" class="faq__back">
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('nav.today') }}
    </NuxtLink>

    <h1 class="faq__title">{{ t('faqPage.title') }}</h1>
    <p class="faq__lead">{{ t('faqPage.lead') }}</p>

    <ol class="faq__list">
      <li v-for="index in items" :id="`q${index}`" :key="index" class="qa">
        <h2 class="qa__question">{{ t(`faqPage.q${index}`) }}</h2>
        <p class="qa__answer">{{ t(`faqPage.a${index}`) }}</p>
      </li>
    </ol>

    <section class="faq__contact">
      <h2 class="qa__question">{{ t('faqPage.moreTitle') }}</h2>
      <p class="qa__answer">
        {{ t('faqPage.moreText') }}
        <a href="mailto:tidyflowup@gmail.com">tidyflowup@gmail.com</a>
      </p>
      <NuxtLink :to="localePath('/contacts')" class="faq__link">{{ t('contactsPage.title') }}</NuxtLink>
    </section>
  </article>
</template>

<style scoped>
.faq {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}

.faq__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  min-height: var(--tap-min);
  color: var(--c-text);
  text-decoration: none;
}

.faq__back:hover {
  color: var(--c-brand);
}

.faq__title {
  font-size: var(--fs-display);
}

.faq__lead {
  color: var(--c-text-muted);
}

.faq__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.qa {
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.qa__question {
  font-size: var(--fs-body);
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.qa__answer {
  color: var(--c-text-muted);
}

.faq__contact {
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
}

.faq__link {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap-min);
  color: var(--c-brand);
}
</style>
