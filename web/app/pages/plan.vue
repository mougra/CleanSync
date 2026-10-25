<script setup lang="ts">
/**
 * План уборки без регистрации.
 *
 * Экран собран вокруг одной мысли: показать ценность до того, как человек что-то
 * отдаст. Поэтому здесь нет ни почты, ни пароля — только семь вопросов о доме,
 * собранный набор и отметки, которые живут на устройстве
 * (`composables/useGuestPlan.ts`).
 *
 * Перенос в аккаунт — отдельная кнопка, а не автоматика: человек должен видеть,
 * что его план переезжает, и понимать, зачем (синхронизация и статистика).
 */
import type { GuestAnswers, GuestTask } from '~/composables/useGuestPlan';
import { buildPlanCalendar, downloadCalendar } from '~/utils/planIcs';

const { t } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
const { plan, loading, failure, load, build, toggle, transferToAccount, doneCount, totalCount } =
  useGuestPlan();

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

/** Порядок блоков тот же, что в каталоге: от частого к редкому. */
const cadenceOrder = [
  'weekly',
  'biweekly',
  'threeWeeks',
  'sixWeeks',
  'monthly',
  'twoMonths',
  'quarterly',
  'fourMonths',
  'semiannual',
  'yearly',
  'daily',
];

const groups = computed(() => {
  const tasks = plan.value?.tasks ?? [];
  const labels = plan.value?.cadences ?? {};

  return cadenceOrder
    .map((cadence) => ({
      cadence,
      label: labels[cadence] ?? cadence,
      tasks: tasks.filter((task) => task.cadence === cadence),
    }))
    .filter((group) => group.tasks.length > 0);
});

const taskMinutes = (tasks: GuestTask[]) => tasks.reduce((total, task) => total + task.minutes, 0);

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
        <span class="plan-result__lead">
          {{
            t('planPage.resultLead', {
              tasks: plan.summary.totalTasks,
              minutes: plan.summary.totalMinutes,
            })
          }}
        </span>
      </header>

      <p class="plan-result__progress">
        {{ t('planPage.progress', { done: doneCount, total: totalCount }) }}
      </p>

      <div v-for="(group, index) in groups" :key="group.cadence" class="plan-group">
        <!--
          Первый блок (недельные дела) раскрыт, остальные свёрнуты: в наборе
          типового дома 150-180 задач, и развёрнутый список целиком превращал
          страницу в бесконечную ленту на телефоне. `<details>` выбран вместо
          своей кнопки: раскрытие бесплатно доступно с клавиатуры и скринридеру.
        -->
        <details :open="index === 0">
          <summary class="plan-group__title">
            {{ group.label }}
            <span class="plan-group__meta">
              {{ group.tasks.length }} · {{ taskMinutes(group.tasks) }} {{ t('zonesPage.minutes') }}
            </span>
          </summary>

          <ul class="plan-group__list">
            <li v-for="task in group.tasks" :key="task.title">
              <label class="plan-task">
                <input
                  type="checkbox"
                  :checked="plan.done.includes(task.title)"
                  @change="toggle(task.title)"
                >
                <span
                  class="plan-task__title"
                  :class="{ 'plan-task__title--done': plan.done.includes(task.title) }"
                >
                  {{ task.title }}
                </span>
                <span class="plan-task__meta">{{ task.minutes }} {{ t('zonesPage.minutes') }}</span>
              </label>
            </li>
          </ul>
        </details>
      </div>

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

.plan-form__title,
.plan-result__save-title {
  font-size: var(--fs-title);
  font-weight: 600;
}

.plan-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
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

.plan-result__lead,
.plan-result__progress,
.plan-group__meta,
.plan-task__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.plan-group {
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.plan-group__title {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: baseline;
  justify-content: space-between;
  min-height: var(--tap-min);
  font-size: var(--fs-body);
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}

/* Свой маркер вместо треугольника браузера: он не зависит от темы и читается. */
.plan-group__title::-webkit-details-marker {
  display: none;
}

.plan-group__title::after {
  content: '+';
  color: var(--c-text-muted);
  font-weight: 400;
}

.plan-group details[open] > .plan-group__title::after {
  content: '−';
}

.plan-group details[open] > .plan-group__title {
  margin-bottom: var(--space-2);
}

.plan-group__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.plan-task {
  display: flex;
  gap: var(--space-3);
  align-items: baseline;
  min-height: var(--tap-min);
  cursor: pointer;
}

.plan-task input {
  width: 20px;
  height: 20px;
  accent-color: var(--c-brand);
}

.plan-task__title {
  flex: 1;
}

.plan-task__title--done {
  color: var(--c-text-muted);
  text-decoration: line-through;
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
