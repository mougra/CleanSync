<script setup lang="ts">
import { HOME_SETUP_STEP_COUNT, countAnsweredSteps } from '~/utils/homeSetupSteps';

/**
 * Настройки: профиль и компактные списки строк.
 *
 * Страница намеренно собрана из строк, а не из крупных карточек: на телефоне
 * растянутые блоки заставляют прокручивать экран ради одного переключателя.
 */
const { t, locale } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/**
 * Режим отпуска. Состояние берём из серии: ключ кэша общий с главной, поэтому
 * переключатель здесь и блок на главной показывают одно и то же без лишних запросов.
 */
const { streak: streakState, setVacation } = await useStreak();

const vacationOn = computed(() => streakState.value?.vacation.active === true);
const vacationBusy = ref(false);

const toggleVacation = async () => {
  if (vacationBusy.value || !auth.isAuthenticated) return;

  vacationBusy.value = true;
  try {
    await setVacation(!vacationOn.value);
  } finally {
    vacationBusy.value = false;
  }
};
// Не деструктурируем: preference — пара геттер/сеттер, деструктуризация ломает запись.
const colorMode = useColorMode();
const api = useApi();

/**
 * Мастер «Настройка по дому» и состояние анкеты.
 *
 * `completed` показывает, пройдена ли анкета: пройти её можно заново и пересобрать
 * план, поэтому строка настроек говорит об этом прямо, а не только называет мастер.
 */
const wizardOpen = ref(false);
const {
  completed: homeProfileDone,
  answeredFields: homeProfileAnswered,
  refresh: refreshHomeProfile,
} = await useHomeProfile();

/**
 * Статус анкеты в строке настроек.
 *
 * Пока анкета не пройдена, показываем прогресс «N из 11» по явно отвеченным
 * полям (`answeredFields`): в самом профиле лежат подставленные значения по
 * умолчанию, поэтому по нему шаг «отвечен» от «пропущен» не отличить. Правило
 * «шаг → поля» общее с мастером и карточкой (`utils/homeSetupSteps.ts`).
 * Пройденная анкета — это статус, а не счётчик: дальше шагов нет. Если данных
 * нет вовсе, честнее сказать «не пройдена», чем показать ноль.
 */
const homeProfileValue = computed(() => {
  if (homeProfileDone.value) {
    return t('homeSetup.passed');
  }

  const done = countAnsweredSteps(homeProfileAnswered.value);

  return done > 0
    ? t('homeSetup.progress', { done, total: HOME_SETUP_STEP_COUNT })
    : t('homeSetup.incomplete');
});

/**
 * Из адреса убираем `?setup=1`: закрытый мастер не должен открываться при
 * возврате на страницу, а ссылка без query остаётся чистой.
 */
const clearSetupQuery = () => {
  if (!isSetupRequested(route.query.setup)) {
    return;
  }

  const query = { ...route.query };
  delete query.setup;
  void router.replace({ path: route.path, query });
};

/**
 * Deep-link `?setup=1` открывает мастер сразу — ссылку можно прислать в письме
 * или положить в карточку на главной. Следим за query, а не только за
 * монтированием: переход из карточки на главной ведёт в тот же маршрут.
 */
watch(
  () => route.query.setup,
  (setup) => {
    if (!isSetupRequested(setup)) {
      return;
    }

    wizardOpen.value = true;
    clearSetupQuery();
  },
  { immediate: true },
);

/** Мастер закрыли: убираем `?setup=1` из адреса, чтобы он не открылся снова. */
const closeWizard = () => {
  wizardOpen.value = false;
  clearSetupQuery();
};

/**
 * Открыть мастер заново.
 *
 * Ответы мастер берёт из общего состояния `home-profile` (тот же ключ, что и
 * страница), поэтому открывается заполненным; после прохождения приходит
 * `@plan-ready`, и статус «N из 11» вместе с планом обновляются.
 */
const openWizard = () => {
  wizardOpen.value = true;
};

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
  clearNuxtData(['today-plan', 'achievements-earned', 'active-challenge', 'challenges-active', 'households']);
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

/*
 * Подтверждение почты. При регистрации письмо не уходит (см. сервер): человек
 * сначала пользуется сервисом, а подтверждение — отдельное действие. Рядом со
 * строкой видно состояние: иконка и подпись говорят, подтверждена почта или нет.
 */
const emailBusy = ref(false);
const emailMessage = ref('');
const emailError = ref(false);

const resendConfirmation = async () => {
  if (!auth.user?.email) {
    return;
  }

  emailBusy.value = true;
  emailMessage.value = '';
  emailError.value = false;

  try {
    await api.request('/api/auth/resend-confirmation', {
      method: 'POST',
      body: { email: auth.user.email },
    });
    emailMessage.value = t('settings.emailConfirmSent');
  } catch {
    emailError.value = true;
    emailMessage.value = t('state.error');
  } finally {
    emailBusy.value = false;
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

/* Смена пароля — только по ссылке из письма: личность подтверждает почта, а не
   знание старого пароля. Ссылка одноразовая, живёт 15 минут и ведёт на страницу
   /reset-password; пока она в пути, показываем сообщение. */
const passwordBusy = ref(false);
const passwordMessage = ref('');
const passwordError = ref(false);

/**
 * Смена пароля по ссылке из письма: сервер отправляет ту же ссылку, что и
 * «забыли пароль», а новый пароль человек вводит на странице /reset-password.
 * Нужна тем, кто не помнит текущий пароль, и работает как второй фактор:
 * ссылка приходит только владельцу ящика и действует 15 минут.
 */
const sendPasswordLink = async () => {
  if (!auth.user?.email) {
    return;
  }

  passwordBusy.value = true;
  passwordMessage.value = '';
  passwordError.value = false;

  try {
    await api.request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: auth.user.email },
    });
    passwordMessage.value = t('settings.passwordLinkSent');
  } catch {
    passwordError.value = true;
    passwordMessage.value = t('state.error');
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

      <!--
        Повторное прохождение — явное действие: справа видно «Пройти заново»,
        статус рядом говорит, что уже есть. Клик открывает мастер с текущими
        ответами (см. HomeSetupWizard: он копирует сохранённый профиль).

        Гостю строка не предлагает действие, а отправляет войти — как строка
        «Дома и участники» выше: собирать план некуда, пока нет аккаунта, и
        открывать мастер было бы тупиком.
      -->
      <SettingsRow
        v-if="auth.isAuthenticated"
        icon="pi-sliders-h"
        :title="t('homeSetup.title')"
        :subtitle="t('settings.homeSetupHint')"
        :value="homeProfileValue"
        :action="t('homeSetup.restart')"
        @action="openWizard"
      />

      <SettingsRow
        v-else
        icon="pi-sliders-h"
        :title="t('homeSetup.title')"
        :subtitle="t('homeSetup.needAuth')"
        :to="localePath('/login')"
      />

      <!--
        Режим отпуска. Пока он включён, на главной вместо задач — состояние
        отпуска с выходом из него, а серия за пропущенные дни не рвётся.
      -->
      <SettingsRow icon="pi-sun" :title="t('vacation.settingsTitle')" :subtitle="t('vacation.settingsHint')">
        <template #control>
          <span class="switch" role="presentation" :class="{ 'switch--on': vacationOn }">
            <input
              class="switch__input"
              type="checkbox"
              :checked="vacationOn"
              :disabled="vacationBusy || !auth.isAuthenticated"
              :aria-label="t('vacation.settingsTitle')"
              @change="toggleVacation"
            >
            <span class="switch__track"><span class="switch__thumb" /></span>
          </span>
        </template>
      </SettingsRow>

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
        :icon="auth.user?.is_email_confirmed ? 'pi-check-circle' : 'pi-envelope'"
        :title="t('settings.email')"
        :subtitle="
          auth.user?.is_email_confirmed
            ? t('settings.emailVerified')
            : t('settings.emailNotVerified')
        "
        expandable
      >
        <template #body>
          <p class="row-hint">{{ t('settings.emailHint') }}</p>

          <AppButton
            v-if="!auth.user?.is_email_confirmed"
            variant="outline"
            block
            :disabled="emailBusy"
            @click="resendConfirmation"
          >
            {{ t('settings.emailConfirmAction') }}
          </AppButton>

          <p v-if="emailMessage" class="row-hint" :class="{ 'row-hint--error': emailError }">
            {{ emailMessage }}
          </p>
        </template>
      </SettingsRow>

      <SettingsRow
        v-if="auth.isAuthenticated"
        icon="pi-lock"
        :title="t('settings.passwordChange')"
        :subtitle="t('settings.passwordHint')"
        expandable
      >
        <template #body>
          <p class="row-hint">{{ t('settings.passwordLinkHint') }}</p>

          <AppButton variant="outline" block :disabled="passwordBusy" @click="sendPasswordLink">
            {{ t('settings.passwordLinkAction') }}
          </AppButton>

          <p v-if="passwordMessage" class="row-hint" :class="{ 'row-hint--error': passwordError }">
            {{ passwordMessage }}
          </p>
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

          <div class="field">
            <PasswordField
              v-model="resetPassword"
              :label="t('settings.resetConfirmLabel')"
              autocomplete="current-password"
            />
          </div>

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

    <!-- Мастер «Настройка по дому»: 11 шагов и генерация плана по ответам -->
    <HomeSetupWizard :open="wizardOpen" @close="closeWizard" @plan-ready="refreshHomeProfile" />
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

/* Обёртка вокруг поля пароля: отступ снизу даёт тот же ритм, что у остальных
   полей формы, а сам PasswordField приносит свои подпись и рамку. */
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
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
