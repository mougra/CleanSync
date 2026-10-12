<script setup lang="ts">
/**
 * Уведомление об использовании cookie.
 *
 * У нас только технически необходимые cookie (авторизация, CSRF, тема, язык),
 * поэтому баннер информирует, а не спрашивает разрешение. Показываем его один
 * раз: выбор хранится в localStorage, и до монтирования баннер скрыт, чтобы
 * не мигал при серверном рендере и не попадал в HTML для поисковиков.
 */
const { t } = useI18n();
const localePath = useLocalePath();

const STORAGE_KEY = 'tidyplan-cookies-notice';
const hidden = ref(true);

onMounted(() => {
  try {
    hidden.value = window.localStorage.getItem(STORAGE_KEY) === 'accepted';
  } catch {
    // Приватный режим может запрещать localStorage — тогда просто не показываем повторно
    hidden.value = true;
  }
});

const accept = () => {
  hidden.value = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, 'accepted');
  } catch {
    // Игнорируем: уведомление и так скрыто до следующего визита
  }
};
</script>

<template>
  <Transition name="banner">
    <aside v-if="!hidden" class="banner" role="status" aria-live="polite">
      <p class="banner__text">
        {{ t('cookies.text') }}
        <NuxtLink :to="localePath('/privacy')" class="banner__link">{{ t('cookies.more') }}</NuxtLink>
      </p>

      <AppButton variant="filled" @click="accept">{{ t('cookies.accept') }}</AppButton>
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
