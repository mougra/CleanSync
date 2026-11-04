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

/**
 * Год в подписи берём по поясу приложения, а не устройства.
 *
 * `new Date().getFullYear()` на стыке лет даёт разные значения на сервере
 * (Москва) и в браузере: в новогоднюю ночь в другом поясе серверный HTML и
 * клиентский рендер расходятся, и Vue сообщает о hydration mismatch.
 */
const year = appToday(useRuntimeConfig().public.appTimeZone).slice(0, 4);

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

    <!--
      Бренд переехал вниз к копирайту: раньше «TidyPlan — Порядок дома без
      выгорания» занимал отдельную строку над ссылками и подвал вырастал на
      треть. Теперь это одна подпись под разделами — и та же фраза, и место
      сэкономлено.
    -->
    <p class="footer__note">© {{ year }} TidyPlan — {{ t('footer.tagline') }}</p>
  </footer>
</template>

<style scoped>
/*
 * Нижний отступ минимальный: подвал и так отделён от контента верхним
 * отступом и `margin-top`, а снизу его подпирает `padding-bottom` контентной
 * колонки шелла (`calc(88px + env(safe-area-inset-bottom))`), который держит
 * нижнюю навигацию на телефоне. Запас там больше высоты навигации (~60px),
 * поэтому подвал её не перекрывает.
 *
 * Подвал компактный: бренд переехал в нижнюю подпись, поэтому строк на одну
 * меньше, а отступы между группами уменьшены. Ссылки остаются полноценными
 * целями нажатия — 32px по высоте.
 */
.footer {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-5);
  padding: var(--space-4) 0 var(--space-1);
  border-top: 1px solid var(--c-border);
}

.footer__heading {
  margin-bottom: var(--space-1);
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
  /* Две колонки ссылок вместо трёх: без отдельной строки бренда подвал короче */
  .footer {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }

  .footer__note {
    grid-column: 1 / -1;
  }
}
</style>
