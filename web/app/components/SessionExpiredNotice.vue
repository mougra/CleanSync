<script setup lang="ts">
/**
 * «Сессия истекла» — единственное место, где приложение признаётся, что сессия
 * кончилась.
 *
 * Раньше это происходило молча: профиль и данные оставались на экране, а любое
 * действие переставало срабатывать без объяснения — до перезагрузки страницы.
 * Человек не понимал, что случилось, и не знал, что делать.
 *
 * Плашка висит сверху и сама не исчезает: пока сессия не восстановлена, каждое
 * действие обречено, и «спрятать» это значило бы вернуть ту же тишину. Уходит она
 * вместе с новым входом (`login` сбрасывает флаг), а на страницах входа её нет —
 * человек там ровно ради этого.
 */
import { appPath } from '~/composables/useAppNav';

const { t } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const auth = useAuthStore();

/** Страницы, на которых вход и так перед глазами. */
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/confirm-email'];

const visible = computed(
  () => auth.sessionExpired && !AUTH_PAGES.includes(appPath(route.path)),
);
</script>

<template>
  <div v-if="visible" class="session" role="alert">
    <i class="pi pi-exclamation-circle session__icon" aria-hidden="true" />

    <p class="session__text">
      <strong class="session__title">{{ t('auth.sessionExpiredTitle') }}</strong>
      <span class="session__hint">{{ t('auth.sessionExpired') }}</span>
    </p>

    <NuxtLink :to="localePath('/login')" class="session__action">
      {{ t('auth.login') }}
    </NuxtLink>
  </div>
</template>

<style scoped>
/*
 * Плашка прижата к верху и не перекрывает нижнее меню и кнопку «+».
 * `z-index` выше шторок (50): если сессия кончилась при открытом листе,
 * человек должен увидеть причину, а не продолжать нажимать впустую.
 */
.session {
  position: fixed;
  top: calc(var(--space-3) + env(safe-area-inset-top));
  left: var(--space-4);
  right: var(--space-4);
  z-index: 70;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  max-width: 520px;
  margin-inline: auto;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-accent);
  color: var(--c-text-on-accent);
  box-shadow: var(--shadow-lift);
}

.session__icon {
  flex: none;
  font-size: 1.25rem;
}

.session__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  font-size: var(--fs-caption);
  line-height: var(--lh-tight);
}

.session__title {
  font-size: var(--fs-body);
}

.session__hint {
  opacity: 0.9;
}

.session__action {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 var(--space-4);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

.session__action:hover {
  filter: brightness(0.96);
}

@media (min-width: 768px) {
  .session {
    left: auto;
    right: var(--space-5);
    width: auto;
    max-width: 420px;
  }
}
</style>
