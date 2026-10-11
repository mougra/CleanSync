<script setup lang="ts">
/**
 * Подвал сайта: ссылки на публичные разделы и справочные страницы.
 *
 * Нужен не «для красоты»: он раскрывает структуру сайта поисковикам
 * (внутренние ссылки с каждой страницы) и даёт людям путь к контактам
 * и частым вопросам. Политика конфиденциальности живёт в настройках
 * и в уведомлении о cookie — в подвале её не дублируем, как и служебные
 * адреса (RSS и llms.txt нужны машинам, а не людям).
 */
const { t } = useI18n();
const localePath = useLocalePath();
const year = new Date().getFullYear();

const sections = [
  { labelKey: 'nav.today', to: '/' },
  { labelKey: 'nav.tips', to: '/tips' },
  { labelKey: 'nav.checklists', to: '/checklists' },
  { labelKey: 'challengesPage.title', to: '/challenges' },
];

const project = [
  { labelKey: 'aboutPage.title', to: '/about' },
  { labelKey: 'guide.title', to: '/guide' },
  { labelKey: 'faqPage.title', to: '/faq' },
  { labelKey: 'contactsPage.title', to: '/contacts' },
];
</script>

<template>
  <footer class="footer">
    <p class="footer__brand">TidyPlan — {{ t('footer.tagline') }}</p>

    <nav class="footer__group" :aria-label="t('footer.sections')">
      <h2 class="footer__heading">{{ t('footer.sections') }}</h2>
      <ul class="footer__list">
        <li v-for="item in sections" :key="item.to">
          <NuxtLink :to="localePath(item.to)" class="footer__link">{{ t(item.labelKey) }}</NuxtLink>
        </li>
      </ul>
    </nav>

    <nav class="footer__group" :aria-label="t('footer.project')">
      <h2 class="footer__heading">{{ t('footer.project') }}</h2>
      <ul class="footer__list">
        <li v-for="item in project" :key="item.to">
          <NuxtLink :to="localePath(item.to)" class="footer__link">{{ t(item.labelKey) }}</NuxtLink>
        </li>
        <li>
          <a class="footer__link" href="mailto:tidyflowup@gmail.com">tidyflowup@gmail.com</a>
        </li>
      </ul>
    </nav>

    <p class="footer__note">© {{ year }} TidyPlan</p>
  </footer>
</template>

<style scoped>
.footer {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-6);
  padding: var(--space-5) 0 var(--space-4);
  border-top: 1px solid var(--c-border);
}

.footer__brand {
  font-weight: 600;
}

.footer__heading {
  margin-bottom: var(--space-2);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.footer__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.footer__link {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  color: var(--c-text);
  text-decoration: none;
}

.footer__link:hover {
  color: var(--c-brand);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.footer__note {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

@media (min-width: 768px) {
  .footer {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .footer__brand,
  .footer__note {
    grid-column: 1 / -1;
  }
}
</style>
