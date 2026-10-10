<script setup lang="ts">
/**
 * Профиль в боковом меню: аватар и никнейм.
 *
 * Аватар приходит с сервера (`avatar_url`): при регистрации это картинка с
 * инициалами, а если человек задал свою ссылку — она. Если картинки нет,
 * показываем инициалы на месте, чтобы блок не «прыгал».
 */
const { t } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();

const displayName = computed(() => {
  const user = auth.user;

  if (!user) {
    return '';
  }

  return user.username || user.email.split('@')[0] || user.email;
});

const initials = computed(() => displayName.value.slice(0, 1).toUpperCase());

const logout = async () => {
  await auth.logout();
  clearNuxtData(['today-plan', 'achievements-earned', 'active-challenge', 'households']);
  await navigateTo(localePath('/'));
};
</script>

<template>
  <div class="profile">
    <template v-if="auth.isAuthenticated">
      <NuxtLink :to="localePath('/settings')" class="profile__card">
        <span class="profile__avatar">
          <img
            v-if="auth.user?.avatar_url"
            class="profile__image"
            :src="auth.user.avatar_url"
            alt=""
            width="40"
            height="40"
          >
          <span v-else class="profile__initials">{{ initials }}</span>
        </span>

        <span class="profile__text">
          <span class="profile__name" :title="displayName">{{ displayName }}</span>
          <span class="profile__email" :title="auth.user?.email">{{ auth.user?.email }}</span>
        </span>
      </NuxtLink>

      <button type="button" class="profile__action" @click="logout">
        <i class="pi pi-sign-out" aria-hidden="true" />
        <span>{{ t('auth.logout') }}</span>
      </button>
    </template>

    <NuxtLink v-else :to="localePath('/login')" class="profile__action">
      <i class="pi pi-sign-in" aria-hidden="true" />
      <span>{{ t('auth.login') }}</span>
    </NuxtLink>
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.profile__card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border-radius: var(--r-row);
  color: var(--c-text);
  text-decoration: none;
}

.profile__card:hover {
  background: var(--c-surface-sunken);
}

.profile__avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  overflow: hidden;
  border-radius: var(--r-pill);
  background: var(--c-surface-mint);
  color: var(--c-brand);
  font-weight: 700;
}

.profile__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.profile__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile__email {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile__action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  font-size: var(--fs-caption);
  text-decoration: none;
  cursor: pointer;
}

.profile__action:hover {
  background: var(--c-surface-sunken);
}
</style>
