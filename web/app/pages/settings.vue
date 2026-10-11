<script setup lang="ts">
/**
 * Настройки: профиль и компактные списки строк.
 *
 * Страница намеренно собрана из строк, а не из крупных карточек: на телефоне
 * растянутые блоки заставляют прокручивать экран ради одного переключателя.
 */
const { t, locale } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
// Не деструктурируем: preference — пара геттер/сеттер, деструктуризация ломает запись.
const colorMode = useColorMode();
const api = useApi();

/** Мастер «Настройка по дому» и признак того, что анкета уже заполнена. */
const wizardOpen = ref(false);
const { completed: homeProfileDone } = await useHomeProfile();

/** Почта для обратной связи: с неё же уходят письма сервиса. */
const SUPPORT_EMAIL = 'tidyflowup@gmail.com';

const themeOptions = [
  { value: 'light', icon: 'pi-sun', label: 'settings.themeLight' },
  { value: 'dark', icon: 'pi-moon', label: 'settings.themeDark' },
  { value: 'system', icon: 'pi-desktop', label: 'settings.themeSystem' },
] as const;

const currentThemeLabel = computed(
  () => t(themeOptions.find((option) => option.value === colorMode.preference)?.label ?? 'settings.themeSystem'),
);

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

/* Профиль: имя меняется, аватар перерисовывается под новое имя. */
const nameDraft = ref('');
const nameBusy = ref(false);
const nameMessage = ref('');

watch(
  () => auth.user?.username ?? '',
  (username) => {
    nameDraft.value = username;
  },
  { immediate: true },
);

const saveName = async () => {
  const username = nameDraft.value.trim();

  if (!username) {
    return;
  }

  nameBusy.value = true;
  nameMessage.value = '';

  try {
    const isGeneratedAvatar = (auth.user?.avatar_url ?? '').includes('ui-avatars.com');
    const avatarUrl = isGeneratedAvatar
      ? `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff`
      : auth.user?.avatar_url;

    const updated = await api.request<{ username: string | null; avatar_url: string | null }>(
      '/api/auth/profile',
      { method: 'PUT', body: { username, avatarUrl } },
    );

    if (auth.user) {
      auth.user.username = updated.username;
      auth.user.avatar_url = updated.avatar_url;
    }

    nameMessage.value = t('settings.nameSaved');
  } catch {
    nameMessage.value = t('state.error');
  } finally {
    nameBusy.value = false;
  }
};

/* Напоминания: объект возвращает обычные refs и функции, деструктуризация безопасна. */
const { supported, permission, devices, busy, refresh, enable, disable, sendTest } =
  usePushNotifications();
const pushMessage = ref('');

onMounted(() => {
  refresh();
});

/** Переключатель уведомлений: включает подписку и сразу просит разрешение. */
const notificationsOn = computed(() => devices.value > 0);

const toggleNotifications = async () => {
  pushMessage.value = '';

  if (notificationsOn.value) {
    await disable();
    return;
  }

  const ok = await enable();

  if (!ok && permission.value === 'denied') {
    pushMessage.value = t('settings.remindersDenied');
  }
};

const testPush = async () => {
  pushMessage.value = '';

  try {
    const delivered = await sendTest();
    pushMessage.value = t('settings.remindersSent', { count: delivered });
  } catch {
    pushMessage.value = t('settings.remindersNoDevices');
  }
};

/* Смена пароля. Сервер требует подтверждённую почту, поэтому при 403
   предлагаем отправить письмо повторно, а не оставляем тупик. */
const currentPassword = ref('');
const newPassword = ref('');
const repeatPassword = ref('');
const passwordBusy = ref(false);
const passwordMessage = ref('');
const passwordError = ref(false);
const needsEmailConfirmation = ref(false);

const canSubmitPassword = computed(
  () => currentPassword.value.length > 0 && newPassword.value.length >= 8,
);

const changePassword = async () => {
  passwordMessage.value = '';
  passwordError.value = false;

  if (newPassword.value !== repeatPassword.value) {
    passwordError.value = true;
    passwordMessage.value = t('auth.passwordMismatch');
    return;
  }

  passwordBusy.value = true;
  try {
    await api.request('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value },
    });

    passwordMessage.value = t('settings.passwordChanged');
    currentPassword.value = '';
    newPassword.value = '';
    repeatPassword.value = '';
  } catch (err) {
    const failure = err as { statusCode?: number; response?: { status?: number } };
    const status = failure.statusCode ?? failure.response?.status;

    passwordError.value = true;

    if (status === 401) {
      passwordMessage.value = t('settings.passwordWrong');
    } else if (status === 403) {
      needsEmailConfirmation.value = true;
      passwordMessage.value = t('settings.passwordNeedsEmail');
    } else {
      passwordMessage.value = t('state.error');
    }
  } finally {
    passwordBusy.value = false;
  }
};

const resendConfirmation = async () => {
  passwordBusy.value = true;
  try {
    await api.request('/api/auth/resend-confirmation', {
      method: 'POST',
      body: { email: auth.user?.email },
    });
    passwordError.value = false;
    passwordMessage.value = t('settings.confirmationSent');
  } finally {
    passwordBusy.value = false;
  }
};

/**
 * Сброс данных: удаление аккаунта со всем содержимым. Действие необратимое,
 * поэтому спрашиваем пароль и подтверждение; сервер удаляет всё каскадом (152-ФЗ).
 */
const resetPassword = ref('');
const resetting = ref(false);
const resetMessage = ref('');
const resetError = ref(false);

const resetData = async () => {
  if (!resetPassword.value) {
    return;
  }

  if (!window.confirm(t('settings.resetConfirm'))) {
    return;
  }

  resetting.value = true;
  resetMessage.value = '';
  resetError.value = false;

  try {
    await api.request('/api/auth/account', {
      method: 'DELETE',
      body: { password: resetPassword.value },
    });

    // Аккаунта больше нет — сессия на сервере уже недействительна,
    // поэтому ошибку выхода игнорируем и просто чистим локальное состояние.
    try {
      await auth.logout();
    } catch {
      auth.user = null;
    }

    clearNuxtData();
    await navigateTo(localePath('/'));
  } catch (err) {
    const failure = err as { statusCode?: number; response?: { status?: number } };
    const status = failure.statusCode ?? failure.response?.status;

    resetError.value = true;
    resetMessage.value = status === 401 ? t('settings.passwordWrong') : t('state.error');
  } finally {
    resetting.value = false;
  }
};

useSeoMeta({ title: () => t('nav.settings') });
</script>

<template>
  <div class="settings">
    <h1 class="settings__title">{{ t('nav.settings') }}</h1>

    <!-- Профиль -->
    <section class="card profile">
      <div class="profile__head">
        <span class="profile__avatar">
          <img
            v-if="auth.user?.avatar_url"
            class="profile__image"
            :src="auth.user.avatar_url"
            alt=""
            width="56"
            height="56"
          >
          <span v-else class="profile__initials">{{ initials }}</span>
        </span>

        <div class="profile__text">
          <p class="profile__title">{{ t('settings.profile') }}</p>
          <p class="profile__greeting">
            {{ auth.isAuthenticated ? t('settings.greeting', { name: displayName }) : t('settings.syncTitle') }}
          </p>
          <p v-if="auth.isAuthenticated" class="profile__email">{{ auth.user?.email }}</p>
        </div>
      </div>

      <template v-if="!auth.isAuthenticated">
        <p class="profile__hint">{{ t('auth.guestHint') }}</p>
        <div class="profile__actions">
          <NuxtLink :to="localePath('/login')" class="btn">{{ t('auth.login') }}</NuxtLink>
          <NuxtLink :to="localePath('/register')" class="btn btn--ghost">{{ t('auth.register') }}</NuxtLink>
        </div>
      </template>

      <form v-else class="profile__form" @submit.prevent="saveName">
        <input v-model="nameDraft" class="field__input" type="text" maxlength="40" :placeholder="t('settings.name')" >
        <AppButton type="submit" variant="outline" :disabled="nameBusy || !nameDraft.trim()">
          {{ t('state.save') }}
        </AppButton>
      </form>

      <p v-if="nameMessage" class="profile__hint">{{ nameMessage }}</p>
    </section>

    <!-- Настройки приложения -->
    <section class="card card--flush">
      <SettingsRow icon="pi-home" :title="t('settings.household')" :to="localePath('/household')" />

      <SettingsRow
        icon="pi-sliders-h"
        :title="t('homeSetup.title')"
        :value="homeProfileDone ? t('homeSetup.done') : ''"
        @click="wizardOpen = true"
      />

      <SettingsRow icon="pi-bell" :title="t('settings.notifications')" expandable>
        <template #control>
          <span class="switch" role="presentation" :class="{ 'switch--on': notificationsOn }">
            <input
              class="switch__input"
              type="checkbox"
              :checked="notificationsOn"
              :disabled="busy || !supported"
              :aria-label="t('settings.notifications')"
              @change="toggleNotifications"
            >
            <span class="switch__track"><span class="switch__thumb" /></span>
          </span>
        </template>

        <template #body>
          <p class="row-hint">{{ t('settings.remindersHint') }}</p>
          <p v-if="!supported" class="row-hint">{{ t('settings.remindersUnsupported') }}</p>
          <p v-else-if="!notificationsOn" class="row-hint">{{ t('settings.remindersEnable') }}</p>
          <AppButton
            v-if="notificationsOn"
            variant="outline"
            :disabled="busy"
            @click="testPush"
          >
            {{ t('settings.remindersTest') }}
          </AppButton>
          <p v-if="pushMessage" class="row-hint">{{ pushMessage }}</p>
        </template>
      </SettingsRow>

      <SettingsRow icon="pi-palette" :title="t('settings.theme')" expandable :value="currentThemeLabel">
        <template #control>
          <span class="theme-value">{{ currentThemeLabel }}</span>
        </template>

        <template #body>
          <div class="segmented">
            <button
              v-for="option in themeOptions"
              :key="option.value"
              type="button"
              class="segmented__item"
              :class="{ 'segmented__item--active': colorMode.preference === option.value }"
              @click="colorMode.preference = option.value"
            >
              <i :class="['pi', option.icon]" aria-hidden="true" />
              {{ t(option.label) }}
            </button>
          </div>
        </template>
      </SettingsRow>

      <SettingsRow icon="pi-globe" :title="t('settings.language')" expandable :value="locale === 'ru' ? 'Русский' : 'English'">
        <template #control>
          <span class="theme-value">{{ locale === 'ru' ? 'Русский' : 'English' }}</span>
        </template>

        <template #body>
          <LocaleSwitch />
        </template>
      </SettingsRow>

      <SettingsRow
        v-if="auth.isAuthenticated"
        icon="pi-lock"
        :title="t('settings.passwordChange')"
        expandable
      >
        <template #body>
          <form class="form" @submit.prevent="changePassword">
            <label class="field">
              <span class="field__label">{{ t('settings.currentPassword') }}</span>
              <input v-model="currentPassword" class="field__input" type="password" autocomplete="current-password" >
            </label>

            <label class="field">
              <span class="field__label">{{ t('settings.newPassword') }}</span>
              <input v-model="newPassword" class="field__input" type="password" autocomplete="new-password" minlength="8" >
            </label>

            <label class="field">
              <span class="field__label">{{ t('settings.repeatPassword') }}</span>
              <input v-model="repeatPassword" class="field__input" type="password" autocomplete="new-password" minlength="8" >
            </label>

            <AppButton type="submit" variant="filled" block :disabled="passwordBusy || !canSubmitPassword">
              {{ t('settings.passwordChange') }}
            </AppButton>
          </form>

          <p v-if="passwordMessage" class="row-hint" :class="{ 'row-hint--error': passwordError }">
            {{ passwordMessage }}
          </p>

          <AppButton
            v-if="needsEmailConfirmation"
            variant="outline"
            :disabled="passwordBusy"
            @click="resendConfirmation"
          >
            {{ t('settings.resendConfirmation') }}
          </AppButton>
        </template>
      </SettingsRow>
    </section>

    <!-- Помощь -->
    <section class="card card--flush">
      <SettingsRow icon="pi-graduation-cap" :title="t('settings.guide')" :to="localePath('/guide')" />
      <SettingsRow icon="pi-comment" :title="t('settings.contact')" :to="`mailto:${SUPPORT_EMAIL}`" />
    </section>

    <!-- Документы -->
    <section class="card card--flush">
      <SettingsRow icon="pi-shield" :title="t('settings.privacy')" :to="localePath('/privacy')" />
    </section>

    <!-- Опасная зона -->
    <section v-if="auth.isAuthenticated" class="card card--flush">
      <SettingsRow icon="pi-trash" :title="t('settings.resetData')" tone="danger" expandable>
        <template #body>
          <p class="row-hint">{{ t('settings.resetHint') }}</p>

          <label class="field">
            <span class="field__label">{{ t('settings.resetConfirmLabel') }}</span>
            <input v-model="resetPassword" class="field__input" type="password" autocomplete="current-password" >
          </label>

          <AppButton
            variant="outline"
            block
            :disabled="!resetPassword || resetting"
            @click="resetData"
          >
            {{ t('settings.resetData') }}
          </AppButton>

          <p v-if="resetMessage" class="row-hint" :class="{ 'row-hint--error': resetError }">
            {{ resetMessage }}
          </p>
        </template>
      </SettingsRow>
    </section>

    <AppButton v-if="auth.isAuthenticated" variant="outline" block @click="logout">
      {{ t('auth.logout') }}
    </AppButton>

    <!-- Мастер «Настройка по дому»: 12 шагов и генерация плана по ответам -->
    <HomeSetupWizard :open="wizardOpen" @close="wizardOpen = false" />
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-bottom: var(--space-5);
}

.settings__title {
  font-size: var(--fs-display);
}

/* Список строк: карточка без внутренних отступов, чтобы строки шли вплотную */
.card--flush {
  padding: 0;
  overflow: hidden;
}

/* Профиль */
.profile {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.profile__head {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.profile__avatar {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  overflow: hidden;
  border-radius: var(--r-pill);
  background: var(--c-surface-mint);
  color: var(--c-brand);
  font-size: var(--fs-title);
  font-weight: 700;
}

.profile__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile__text {
  min-width: 0;
}

.profile__title {
  font-size: var(--fs-title);
  font-weight: 600;
}

.profile__greeting {
  color: var(--c-text);
}

.profile__email {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile__hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.profile__actions {
  display: flex;
  gap: var(--space-2);
}

.profile__form {
  display: flex;
  gap: var(--space-2);
}

.profile__form .field__input {
  flex: 1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}

.field__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.field__input {
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
}

/* Переключатель */
.switch {
  display: inline-flex;
  align-items: center;
}

.switch__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.switch__track {
  position: relative;
  display: block;
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: var(--c-border);
  transition: background-color 0.15s ease;
}

.switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--c-surface);
  transition: transform 0.15s ease;
}

.switch--on .switch__track {
  background: var(--c-brand);
}

.switch--on .switch__thumb {
  transform: translateX(18px);
}

.switch__input:disabled + .switch__track {
  opacity: 0.5;
}

/* Тема и язык */
.theme-value {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.segmented {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-1);
}

.segmented__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  min-height: 56px;
  padding: var(--space-2);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text-muted);
  font: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
}

.segmented__item--active {
  border-color: var(--c-brand);
  color: var(--c-brand);
  font-weight: 600;
}

.form {
  display: flex;
  flex-direction: column;
}

.row-hint {
  margin-bottom: var(--space-2);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.row-hint--error {
  color: var(--c-danger);
}

/* Кнопки страницы */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: 1px solid var(--c-brand);
  border-radius: var(--r-row);
  background: var(--c-brand);
  color: #fff;
  font: inherit;
  text-decoration: none;
  cursor: pointer;
}

.btn--ghost {
  border-color: var(--c-border);
  background: transparent;
  color: var(--c-text);
}

@media (min-width: 1024px) {
  /* Широкий экран: списку настроек хватает 550px, дальше — воздух */
  .settings {
    max-width: var(--content-narrow);
  }
}
</style>
