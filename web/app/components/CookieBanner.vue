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
  left: var(--space-4);
  right: var(--space-4);
  /*
   * На телефоне баннер живёт СВЕРХУ, а не снизу. Внизу уже стоят кнопка «+»,
   * нижняя навигация и колонка уведомлений («FloatingNotifications»): на узком
   * экране они накладывались друг на друга, а баннер — единственный элемент,
   * который можно показать и сверху, ничего не ломая. Измерено в headless Chrome
   * на 390x844: до переноса рамки баннера и уведомления пересекались.
   */
  top: calc(var(--space-4) + env(safe-area-inset-top));
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
  flex-wrap: wrap;
  gap: var(--space-2);
}

@media (min-width: 768px) {
  /*
   * На десктопе баннер возвращается вниз, но в левый нижний угол: правый занят
   * кнопкой «+», и над ней же висит колонка уведомлений. Так три плавающих
   * элемента не делят один и тот же пиксель (проверено замером рамок).
   */
  .banner {
    top: auto;
    left: var(--space-5);
    right: auto;
    bottom: var(--space-7);
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
