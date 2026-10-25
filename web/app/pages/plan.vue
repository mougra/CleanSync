<script setup lang="ts">
/**
 * План уборки без регистрации.
 *
 * Экран собран вокруг одной мысли: показать ценность до того, как человек что-то
 * отдаст. Поэтому здесь нет ни почты, ни пароля — только шесть вопросов о доме и
 * короткая сводка того, что получится: сколько дел, сколько времени, что делать
 * каждую неделю, а что раз в месяц и реже.
 *
 * Списка дел с галочками здесь больше нет: человек пришёл узнать, что войдёт в
 * план, а не отмечать чужой набор. Отметки живут в приложении, после регистрации.
 *
 * Перенос в аккаунт — отдельная кнопка, а не автоматика: человек должен видеть,
 * что его ответы переезжают, и понимать, зачем.
 */
import type { GuestAnswers } from '~/composables/useGuestPlan';
import { buildPlanCalendar, downloadCalendar } from '~/utils/planIcs';

const { t, locale } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
const { plan, loading, failure, load, build, transferToAccount } = useGuestPlan();

/**
 * Форма с разумными умолчаниями: пустая анкета заставляет заполнять всё ради
 * пробы, а типовой городской дом — это честная отправная точка, которую видно
 * в полях и можно поправить.
 */
const form = reactive<
  Required<
    Pick<
      GuestAnswers,
      'housingType' | 'rooms' | 'composition' | 'pets' | 'dailyMinutes' | 'cleaningLevel'
    >
  >
>({
  housingType: 'apartment',
  rooms: '3-4',
  composition: 'alone',
  pets: [],
  dailyMinutes: '30to60',
  cleaningLevel: 'normal',
});

/**
 * Варианты ответов: `value` уходит в API, `key` — суффикс ключа i18n
 * (`planPage.housingApartment`). Пара в одном месте: шаблон не собирает имена
 * ключей тернарниками, а новый вариант добавляется одной строкой.
 */
const option = (value: string, key: string) => ({ value, key });

const housings = [
  option('apartment', 'Apartment'),
  option('house', 'House'),
  option('townhouse', 'Townhouse'),
  option('studio', 'Studio'),
];

const roomsOptions = [
  option('1-2', '1'),
  option('3-4', '2'),
  option('5-7', '3'),
  option('8+', '4'),
];

const compositions = [
  option('alone', 'Alone'),
  option('partner', 'Partner'),
  option('family_kids', 'Family'),
  option('roommates', 'Roommates'),
];

const petsOptions = [option('cats', 'Cats'), option('dogs', 'Dogs')];

const minutesOptions = [
  option('under30', 'Under30'),
  option('30to60', '30to60'),
  option('1to2h', '1to2h'),
  option('depends', 'Depends'),
];

const levels = [option('light', 'Light'), option('normal', 'Normal'), option('deep', 'Deep')];

const togglePet = (pet: string) => {
  const set = new Set(form.pets);

  if (set.has(pet)) set.delete(pet);
  else set.add(pet);

  form.pets = [...set];
};

const onBuild = async () => {
  await build({ ...form });
};

const onTransfer = async () => {
  const moved = await transferToAccount();

  if (moved) {
    await navigateTo(localePath('/'));
  }
};

/**
 * Календарь вместо push: файл с повторами и будильником открывается в системном
 * календаре, и напоминание приходит при закрытом приложении (см. `utils/planIcs`).
 */
const onCalendar = () => {
  if (!plan.value) return;

  const content = buildPlanCalendar(plan.value.tasks, {
    name: t('planPage.resultTitle'),
  });

  downloadCalendar(content, t('planPage.calendarFileName'));
};

onMounted(load);

useCanonical();

useSeoMeta({
  title: () => t('planPage.title'),
  description: () => t('planPage.lead'),
  ogTitle: () => t('planPage.title'),
  ogDescription: () => t('planPage.lead'),
});
</script>

<template>
  <div class="plan-page">
    <h1 class="plan-page__title">{{ t('planPage.title') }}</h1>
    <p class="plan-page__lead">{{ t('planPage.lead') }}</p>

    <section class="plan-form">
      <h2 class="plan-form__title">{{ t('planPage.formTitle') }}</h2>

      <fieldset class="plan-form__field">
        <legend class="plan-form__label">{{ t('planPage.housing') }}</legend>
        <div class="chips">
          <button
            v-for="item in housings"
            :key="item.value"
            type="button"
            class="chip"
            :class="{ 'chip--active': form.housingType === item.value }"
            @click="form.housingType = item.value"
          >
            {{ t(`planPage.housing${item.key}`) }}
          </button>
        </div>
      </fieldset>

      <fieldset class="plan-form__field">
        <legend class="plan-form__label">{{ t('planPage.rooms') }}</legend>
        <div class="chips">
          <button
            v-for="item in roomsOptions"
            :key="item.value"
            type="button"
            class="chip"
            :class="{ 'chip--active': form.rooms === item.value }"
            @click="form.rooms = item.value"
          >
            {{ t(`planPage.rooms${item.key}`) }}
          </button>
        </div>
      </fieldset>

      <fieldset class="plan-form__field">
        <legend class="plan-form__label">{{ t('planPage.composition') }}</legend>
        <div class="chips">
          <button
            v-for="item in compositions"
            :key="item.value"
            type="button"
            class="chip"
            :class="{ 'chip--active': form.composition === item.value }"
            @click="form.composition = item.value"
          >
            {{ t(`planPage.composition${item.key}`) }}
          </button>
        </div>
      </fieldset>

      <fieldset class="plan-form__field">
        <legend class="plan-form__label">{{ t('planPage.pets') }}</legend>
        <div class="chips">
          <button
            v-for="item in petsOptions"
            :key="item.value"
            type="button"
            class="chip"
            :class="{ 'chip--active': form.pets.includes(item.value) }"
            @click="togglePet(item.value)"
          >
            {{ t(`planPage.pets${item.key}`) }}
          </button>
        </div>
      </fieldset>

      <fieldset class="plan-form__field">
        <legend class="plan-form__label">{{ t('planPage.minutes') }}</legend>
        <div class="chips">
          <button
            v-for="item in minutesOptions"
            :key="item.value"
            type="button"
            class="chip"
            :class="{ 'chip--active': form.dailyMinutes === item.value }"
            @click="form.dailyMinutes = item.value"
          >
            {{ t(`planPage.minutes${item.key}`) }}
          </button>
        </div>
      </fieldset>

      <fieldset class="plan-form__field">
        <legend class="plan-form__label">{{ t('planPage.level') }}</legend>
        <div class="chips">
          <button
            v-for="item in levels"
            :key="item.value"
            type="button"
            class="chip"
            :class="{ 'chip--active': form.cleaningLevel === item.value }"
            @click="form.cleaningLevel = item.value"
          >
            {{ t(`planPage.level${item.key}`) }}
          </button>
        </div>
      </fieldset>

      <AppButton variant="filled" block :disabled="loading" @click="onBuild">
        {{ loading ? t('planPage.building') : t('planPage.build') }}
      </AppButton>

      <p v-if="failure === 'preview'" class="plan-form__error">{{ t('planPage.errorBuild') }}</p>
    </section>

    <section v-if="plan" class="plan-result">
      <header class="plan-result__head">
        <h2 class="plan-result__title">{{ t('planPage.resultTitle') }}</h2>
        <span class="plan-result__lead">{{ t('planPage.resultLead') }}</span>
      </header>

      <!--
        Короткая сводка вместо списка дел.

        Раньше здесь был весь набор с галочками: 150-180 строк, которые человек
        листал, ничего с ними не делая. Смысл гостевого экрана — показать, что
        получится, а не заставить отметить чужой план. Поэтому — три числа и
        распределение по периодичности, как на финальном экране мастера у
        вошедшего (HomeSetupWizard).
      -->
      <ul class="plan-summary">
        <li>
          <span>{{ t('planPage.resultTasks') }}</span>
          <strong>{{ plan.summary.totalTasks }}</strong>
        </li>
        <li>
          <span>{{ t('planPage.resultMinutes') }}</span>
          <strong>{{ formatDuration(plan.summary.totalMinutes, locale) }}</strong>
        </li>
        <li>
          <span>{{ t('planPage.resultBusiest') }}</span>
          <strong>
            {{ formatMinutes(plan.summary.maxDailyMinutes, locale) }} /
            {{ formatMinutes(plan.summary.dailyLimit, locale) }}
          </strong>
        </li>
        <li>
          <span>{{ t('planPage.resultWeekly') }}</span>
          <strong>{{ plan.summary.weeklyTasks }}</strong>
        </li>
        <li>
          <span>{{ t('planPage.resultMonthly') }}</span>
          <strong>{{ plan.summary.monthlyTasks }}</strong>
        </li>
      </ul>

      <p class="plan-result__rooms">{{ plan.summary.rooms.join(' · ') }}</p>

      <AppButton :to="localePath('/')" variant="filled" block>
        {{ t('planPage.resultHome') }}
      </AppButton>

      <section class="plan-result__save">
        <h2 class="plan-result__save-title">{{ t('planPage.calendarTitle') }}</h2>
        <p class="plan-result__save-text">
          {{ t('planPage.calendarText') }}
        </p>
        <AppButton variant="outline" block @click="onCalendar">
          {{ t('planPage.calendarButton') }}
        </AppButton>
      </section>

      <section class="plan-result__save">
        <h2 class="plan-result__save-title">{{ t('planPage.saveTitle') }}</h2>
        <p class="plan-result__save-text">
          {{ t('planPage.saveText') }}
        </p>

        <div class="plan-result__actions">
          <template v-if="auth.isAuthenticated">
            <AppButton variant="filled" :disabled="loading" @click="onTransfer">
              {{ loading ? t('planPage.transferring') : t('planPage.transfer') }}
            </AppButton>
          </template>
          <template v-else>
            <AppButton :to="localePath('/register')" variant="filled">
              {{ t('planPage.saveRegister') }}
            </AppButton>
            <AppButton :to="localePath('/login')" variant="outline">
              {{ t('planPage.saveLogin') }}
            </AppButton>
          </template>
        </div>

        <p v-if="failure === 'transfer'" class="plan-form__error">
          {{ t('planPage.errorTransfer') }}
        </p>
      </section>
    </section>
  </div>
</template>

<style scoped>
.plan-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}

.plan-page__title {
  font-size: var(--fs-display);
}

.plan-page__lead {
  color: var(--c-text-muted);
}

.plan-form,
.plan-result__save {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

/*
 * Расстояние между вопросами больше, чем внутри вопроса: иначе «Сколько комнат»
 * визуально прилипает к предыдущим вариантам и читается как часть прошлого
 * вопроса. Внутри вопроса подпись отделена от вариантов 12px — на телефоне это
 * заметно, на десктопе не разваливает блок.
 */
.plan-form {
  gap: var(--space-4);
}

.plan-form__title,
.plan-result__save-title {
  font-size: var(--fs-title);
  font-weight: 600;
}

.plan-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  border: 0;
}

.plan-form__label {
  padding: 0;
  font-size: var(--fs-caption);
  color: var(--c-text-muted);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip {
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text);
  font: inherit;
  cursor: pointer;
}


.chip--active {
  border-color: var(--c-brand);
  background: var(--c-brand);
  color: var(--c-surface);
}

.plan-form__error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}

.plan-result {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.plan-result__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: baseline;
  justify-content: space-between;
}

.plan-result__title {
  font-size: var(--fs-title);
  font-weight: 600;
}

.plan-result__lead {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

/*
 * Сводка плана: строка «подпись — значение», как в финальном экране мастера.
 * Числа выделены, подписи приглушены: человек смотрит на числа.
 */
.plan-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
  list-style: none;
}

.plan-summary li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: baseline;
  justify-content: space-between;
}

.plan-summary span {
  color: var(--c-text-muted);
}

.plan-summary strong {
  font-weight: 600;
}

.plan-result__rooms {
  margin: 0;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.plan-result__save-text {
  color: var(--c-text-muted);
}

.plan-result__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
