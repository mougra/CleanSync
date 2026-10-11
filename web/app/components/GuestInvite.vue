<script setup lang="ts">
/**
 * Приглашение для гостя: один раз за всё время, закрытие запоминается.
 *
 * Все возможности открыты только зарегистрированным, поэтому вместо молчаливого
 * пустого экрана предлагаем аккаунт и опрос о доме.
 *
 * Два варианта одного и того же приглашения:
 * - `sidebar` — карточка в боковом меню (десктоп), между навигацией и аккаунтом:
 *   место постоянное и заметное, поток страницы не занимается;
 * - `banner` — плашка в потоке страницы (телефон), где боковое меню скрыто.
 *
 * Логика видимости и закрытия — в `useGuestInvite`, чтобы два экземпляра
 * не расходились.
 */
withDefaults(defineProps<{ variant?: 'banner' | 'sidebar' }>(), { variant: 'banner' });

const { t } = useI18n();
const localePath = useLocalePath();
const { shown, dismiss } = useGuestInvite();
</script>

<template>
  <aside v-if="shown" class="invite" :class="`invite--${variant}`">
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

/*
 * Вариант в боковом меню: колонка узкая (248px), поэтому текст компактнее,
 * кнопки идут в столбик, а внутренние отступы меньше.
 */
.invite--sidebar {
  gap: var(--space-1);
  padding: var(--space-4) var(--space-3);
  border-radius: var(--r-row);
}

.invite--sidebar .invite__badge {
  padding: 2px 8px;
  font-size: 0.6875rem;
}

.invite--sidebar .invite__title {
  font-size: var(--fs-caption);
  line-height: 1.3;
}

.invite--sidebar .invite__text {
  font-size: 0.75rem;
  line-height: 1.35;
}

.invite--sidebar .invite__actions {
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.invite--sidebar .invite__close {
  top: var(--space-1);
  right: var(--space-1);
  width: 28px;
  height: 28px;
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
  /* На широком экране баннеру в потоке хватает читаемой ширины */
  .invite--banner {
    max-width: var(--content-reading);
  }
}

@media (prefers-reduced-motion: reduce) {
  .invite {
    animation: none;
  }
}
</style>
