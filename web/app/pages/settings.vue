<script setup lang="ts">
/** Настройки: тема, язык и профиль. Авторизация — httpOnly-cookie. */
const { t } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
// Не деструктурируем: preference — пара геттер/сеттер, деструктуризация ломает запись.
const colorMode = useColorMode();
const api = useApi();

const themeOptions = [
  { value: 'light', icon: 'pi-sun', label: 'settings.themeLight' },
  { value: 'dark', icon: 'pi-moon', label: 'settings.themeDark' },
  { value: 'system', icon: 'pi-desktop', label: 'settings.themeSystem' },
] as const;

const logout = async () => {
  await auth.logout();
  clearNuxtData(['today-plan', 'achievements-earned', 'active-challenge']);
  await navigateTo(localePath('/'));
};

// Напоминания: объект возвращает обычные refs и функции, деструктуризация безопасна.
const { supported, permission, devices, busy, refresh, enable, disable, sendTest } =
  usePushNotifications();
const pushMessage = ref('');

onMounted(() => {
  refresh();
});

const enablePush = async () => {
  pushMessage.value = '';
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

const disablePush = async () => {
  pushMessage.value = '';
  await disable();
};

// Смена пароля. Сервер требует подтверждённую почту, поэтому при 403
// предлагаем отправить письмо повторно, а не оставляем тупик.
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
 * Удаление аккаунта. Действие необратимое, поэтому спрашиваем пароль
 * и подтверждение; сервер удаляет все связанные данные каскадом (152-ФЗ).
 */
const deletePassword = ref('');
const deleting = ref(false);
const deleteMessage = ref('');
const deleteError = ref(false);

const deleteAccount = async () => {
  if (!deletePassword.value) {
    return;
  }

  if (!window.confirm(t('settings.dangerHint'))) {
    return;
  }

  deleting.value = true;
  deleteMessage.value = '';
  deleteError.value = false;

  try {
    await api.request('/api/auth/account', {
      method: 'DELETE',
      body: { password: deletePassword.value },
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

    deleteError.value = true;
    deleteMessage.value = status === 401 ? t('settings.passwordWrong') : t('state.error');
  } finally {
    deleting.value = false;
  }
};

useSeoMeta({ title: () => t('nav.settings') });
</script>

<template>
  <div class="page">
    <section class="card">
      <h2 class="card__title">{{ t('settings.appearance') }}</h2>

      <div class="field">
        <span class="field__label">{{ t('settings.theme') }}</span>
        <div class="segmented" role="group" :aria-label="t('settings.theme')">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            class="segmented__item"
            :class="{ 'segmented__item--active': colorMode.preference === option.value }"
            :aria-pressed="colorMode.preference === option.value"
            @click="colorMode.preference = option.value"
          >
            <i :class="['pi', option.icon]" aria-hidden="true" />
            {{ t(option.label) }}
          </button>
        </div>
      </div>

      <div class="field">
        <span class="field__label">{{ t('settings.language') }}</span>
        <LocaleSwitch />
      </div>
    </section>

    <section class="card">
      <h2 class="card__title">{{ t('settings.reminders') }}</h2>
      <p class="card__text">{{ t('settings.remindersHint') }}</p>

      <p v-if="!auth.isAuthenticated" class="card__text">
        {{ t('settings.remindersSignIn') }}
      </p>

      <p v-else-if="!supported" class="card__text">
        {{ t('settings.remindersUnsupported') }}
      </p>

      <template v-else>
        <p v-if="permission === 'denied'" class="card__text card__text--warn">
          {{ t('settings.remindersDenied') }}
        </p>
        <p v-else-if="devices > 0" class="card__text">
          {{ t('settings.remindersActive', { count: devices }) }}
        </p>

        <div class="actions">
          <button
            v-if="devices === 0"
            type="button"
            class="btn"
            :disabled="busy"
            @click="enablePush"
          >
            <i class="pi pi-bell" aria-hidden="true" />
            {{ t('settings.remindersEnable') }}
          </button>

          <template v-else>
            <button type="button" class="btn btn--ghost" :disabled="busy" @click="testPush">
              {{ t('settings.remindersTest') }}
            </button>
            <button type="button" class="btn btn--ghost" :disabled="busy" @click="disablePush">
              {{ t('settings.remindersDisable') }}
            </button>
          </template>
        </div>

        <p v-if="pushMessage" class="card__text">{{ pushMessage }}</p>
      </template>
    </section>

    <section class="card">
      <h2 class="card__title">{{ t('auth.profile') }}</h2>

      <template v-if="auth.isAuthenticated">
        <p class="card__text">{{ auth.user?.email }}</p>
        <button type="button" class="btn" @click="logout">
          <i class="pi pi-sign-out" aria-hidden="true" />
          {{ t('auth.logout') }}
        </button>
      </template>

      <template v-else>
        <p class="card__text">{{ t('auth.guestHint') }}</p>
        <div class="actions">
          <NuxtLink :to="localePath('/login')" class="btn">
            {{ t('auth.login') }}
          </NuxtLink>
          <NuxtLink :to="localePath('/register')" class="btn btn--ghost">
            {{ t('auth.register') }}
          </NuxtLink>
        </div>
      </template>
    </section>

    <!-- Смена пароля: доступна только вошедшему с подтверждённой почтой -->
    <section v-if="auth.isAuthenticated" class="card">
      <h2 class="card__title">{{ t('settings.password') }}</h2>
      <p class="card__text">{{ t('settings.passwordHint') }}</p>

      <form class="form" @submit.prevent="changePassword">
        <label class="field">
          <span class="field__label">{{ t('settings.currentPassword') }}</span>
          <input
            v-model="currentPassword"
            class="field__input"
            type="password"
            autocomplete="current-password"
            required
          >
        </label>

        <label class="field">
          <span class="field__label">{{ t('auth.newPassword') }}</span>
          <input
            v-model="newPassword"
            class="field__input"
            type="password"
            minlength="8"
            autocomplete="new-password"
            required
          >
        </label>

        <label class="field">
          <span class="field__label">{{ t('auth.passwordRepeat') }}</span>
          <input
            v-model="repeatPassword"
            class="field__input"
            type="password"
            minlength="8"
            autocomplete="new-password"
            required
          >
        </label>

        <p v-if="passwordMessage" class="card__text" :class="{ 'card__text--warn': passwordError }">
          {{ passwordMessage }}
        </p>

        <div class="actions">
          <AppButton variant="filled" type="submit" :disabled="!canSubmitPassword || passwordBusy">
            {{ t('settings.passwordChange') }}
          </AppButton>
          <AppButton
            v-if="needsEmailConfirmation"
            variant="outline"
            :disabled="passwordBusy"
            @click="resendConfirmation"
          >
            {{ t('settings.resendConfirmation') }}
          </AppButton>
        </div>
      </form>
    </section>

    <!-- Удаление аккаунта: право на удаление данных (152-ФЗ) -->
    <section v-if="auth.isAuthenticated" class="card card--danger">
      <h2 class="card__title">{{ t('settings.danger') }}</h2>
      <p class="card__text">{{ t('settings.dangerHint') }}</p>

      <label class="field">
        <span class="field__label">{{ t('settings.deleteAccountConfirm') }}</span>
        <input
          v-model="deletePassword"
          class="field__input"
          type="password"
          autocomplete="current-password"
        >
      </label>

      <p v-if="deleteMessage" class="card__text" :class="{ 'card__text--warn': deleteError }">
        {{ deleteMessage }}
      </p>

      <AppButton
        variant="outline"
        block
        :disabled="!deletePassword || deleting"
        @click="deleteAccount"
      >
        {{ t('settings.deleteAccount') }}
      </AppButton>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
}

.card__title {
  font-size: var(--fs-title);
}

.card__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.card__text--warn {
  color: var(--c-danger);
}

/* Опасная зона: удаление аккаунта выделяем фоном, чтобы не нажать случайно */
.card--danger {
  background: var(--c-surface-warm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.field__input {
  min-height: 52px;
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
}

.segmented {
  display: flex;
  gap: var(--space-1);
  padding: 4px;
  border-radius: var(--r-pill);
  background: var(--c-bg);
}

.segmented__item {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--tap-min);
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  cursor: pointer;
}

.segmented__item--active {
  background: var(--c-surface);
  color: var(--c-brand);
  font-weight: 600;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-brand);
  color: var(--c-onbrand);
  font: inherit;
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.btn--ghost {
  background: transparent;
  border: 1.5px solid var(--c-brand);
  color: var(--c-brand);
}
</style>
