<script setup lang="ts">
/**
 * Баннер cookie и согласие на аналитику.
 *
 * Раньше баннер только информировал: на сайте были исключительно технические
 * cookie (вход, CSRF, тема, язык). С Метрикой появилась третья сторона, поэтому
 * теперь это выбор из двух кнопок, а не «Понятно»: аналитический скрипт грузится
 * только после явного согласия (`composables/useCookieConsent.ts`).
 *
 * Баннер скрыт до монтирования: иначе он мигал бы при серверном рендере и
 * попадал в HTML для поисковиков.
 */
const { t } = useI18n();
const localePath = useLocalePath();
const { consent, ready, load, accept } = useCookieConsent();

onMounted(load);

/** Показываем, только когда выбор ещё не сделан и мы уже знаем об этом. */
const visible = computed(() => ready.value && consent.value === null);

const choose = (value: 'essential' | 'all') => accept(value);
</script>

<template>
  <Transition name="banner">
    <aside v-if="visible" class="banner" role="dialog" aria-live="polite">
      <p class="banner__text">
        {{ t('cookies.text') }}
        <NuxtLink :to="localePath('/privacy')" class="banner__link">{{ t('cookies.more') }}</NuxtLink>
      </p>

      <div class="banner__actions">
        <AppButton variant="outline" @click="choose('essential')">
          {{ t('cookies.essential') }}
        </AppButton>
        <AppButton variant="filled" @click="choose('all')">
          {{ t('cookies.accept') }}
        </AppButton>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.banner {
  position: fixed;
  left: auto;
  right: var(--space-2);
  max-width: min(420px, calc(100% - var(--space-4)));
  /*
   * Баннер снизу справа, но НАД кнопкой «+» и нижней навигацией: правый нижний
   * угол уже занят FAB и колонкой уведомлений (`FloatingNotifications`), и
   * баннер лёг бы прямо на них. Формула та же, что у уведомлений: верх кнопки
   * «+» — это `--nav-height + --space-5 + --fab-size`.
   */
  bottom: calc(var(--nav-height) + var(--space-5) + var(--fab-size) + env(safe-area-inset-bottom));
  z-index: 54;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
  box-shadow: 0 10px 30px rgb(0 0 0 / 18%);
}

.banner__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.banner__link {
  color: var(--c-brand);
  text-underline-offset: 3px;
}

.banner__actions {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: var(--space-2);
}

/*
 * Кнопки в одну строку и делят ширину поровну. Шрифт и боковые отступы меньше,
 * чем у обычной кнопки системы: с ними «Только необходимые» и «Принять
 * аналитику» не помещались рядом даже в десктопных 388px и переносились друг
 * под друга. Если слову совсем тесно, оно переносится внутри своей кнопки, но
 * ряд остаётся одним.
 */
.banner__actions :deep(.btn) {
  flex: 1 1 0;
  min-width: 0;
  padding: 0 var(--space-2);
  font-size: var(--fs-caption);
  line-height: 1.15;
  text-align: center;
  white-space: normal;
}

@media (min-width: 768px) {
  /*
   * Десктоп: правый нижний угол экрана, но выше кнопки «+» и колонки
   * уведомлений — те же координаты, что у уведомлений.
   */
  .banner {
    left: auto;
    right: var(--space-5);
    bottom: calc(var(--space-7) + var(--fab-size) + var(--space-4));
    max-width: 420px;
  }
}

.banner-enter-active,
.banner-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
