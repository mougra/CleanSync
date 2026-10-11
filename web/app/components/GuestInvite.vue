<script setup lang="ts">
/**
 * Приглашение для гостя: показывается один раз за всё время, закрытие
 * запоминается в localStorage.
 *
 * Смысл: все возможности открыты только зарегистрированным, поэтому вместо
 * молчаливого пустого экрана предлагаем аккаунт и опрос о доме. Проверку
 * хранилища делаем на клиенте: на сервере localStorage нет, а рендерить баннер
 * в SSR нельзя — разметка разойдётся при гидрации.
 */
const { t } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const auth = useAuthStore();

const STORAGE_KEY = 'tidyplan-guest-invite-dismissed';

/** Куда не показываем: на самих страницах входа и регистрации это шум. */
const hiddenRoutes = ['/login', '/register', '/confirm-email', '/reset-password', '/forgot-password'];

const visible = ref(false);

onMounted(() => {
  const onAuthPage = hiddenRoutes.some((path) => route.path.startsWith(path));

  visible.value = !onAuthPage && !localStorage.getItem(STORAGE_KEY);
});

const dismiss = () => {
  visible.value = false;

  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Приватный режим: баннер просто вернётся в следующий раз — это не беда
  }
};
</script>

<template>
  <aside v-if="visible && !auth.isAuthenticated" class="invite">
    <button
      type="button"
      class="invite__close"
      :aria-label="t('common.close')"
      @click="dismiss"
    >
      <i class="pi pi-times" aria-hidden="true" />
    </button>

    <span class="invite__badge">{{ t('guest.badge') }}</span>
    <h2 class="invite__title">{{ t('guest.title') }}</h2>
    <p class="invite__text">{{ t('guest.text') }}</p>

    <div class="invite__actions">
      <AppButton variant="accent" :to="localePath('/register')">
        {{ t('guest.register') }}
      </AppButton>
      <AppButton :to="localePath('/guide')">{{ t('guest.howItWorks') }}</AppButton>
    </div>
  </aside>
</template>

<style scoped>
.invite {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-5);
  border-radius: var(--r-card);
  background: var(--grad-mint);
  animation: invite-in var(--dur-base) var(--ease-out) both;
}

/* Мягкие пятна: тот же приём, что в пустых состояниях */
.invite::before,
.invite::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.invite::before {
  top: -70px;
  right: -40px;
  width: 190px;
  height: 190px;
  background: radial-gradient(circle, var(--c-surface-mint) 0%, transparent 70%);
}

.invite::after {
  bottom: -90px;
  left: -50px;
  width: 170px;
  height: 170px;
  background: radial-gradient(circle, var(--c-accent-soft) 0%, transparent 70%);
}

.invite__badge,
.invite__title,
.invite__text,
.invite__actions {
  position: relative;
}

.invite__badge {
  padding: 4px 12px;
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-brand);
  font-size: var(--fs-caption);
  font-weight: 600;
}

.invite__title {
  margin: 0;
  font-size: var(--fs-title);
  line-height: var(--lh-tight);
}

.invite__text {
  margin: 0;
  max-width: 46ch;
  color: var(--c-text-muted);
}

.invite__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.invite__close {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  z-index: 1;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text-muted);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out);
}

.invite__close:hover {
  background: var(--c-surface);
}

@keyframes invite-in {
  from {
    opacity: 0;
    transform: translate3d(0, 10px, 0);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (min-width: 1024px) {
  /* На широком экране баннеру хватает читаемой ширины */
  .invite {
    max-width: var(--content-reading);
  }
}

@media (prefers-reduced-motion: reduce) {
  .invite {
    animation: none;
  }
}
</style>
