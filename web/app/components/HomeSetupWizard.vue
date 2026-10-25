<script setup lang="ts">
/**
 * Мастер «Настройка по дому» — 7 шагов в модалке (макеты «настройка по дому*.jpg»).
 *
 * Ответы копятся **на устройстве** и уходят на сервер одним `PUT` в конце.
 * Так работают «Назад», «Пропустить» и крестик: до последнего шага на сервере
 * ничего не меняется, и закрыть мастер — значит ничего не сохранить. Черновик
 * лежит в localStorage, поэтому обрыв сети или закрытая вкладка не съедают
 * ответы: при следующем открытии мастер вернётся на тот же шаг.
 *
 * На последнем шаге сервер собирает план по ответам и возвращает его:
 * интерфейс только показывает результат.
 */
import type { HomePlan, HomeProfile } from '~/types/homeProfile';
import { HOME_SETUP_STEP_FIELDS, type HomeSetupField } from '~/utils/homeSetupSteps';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; planReady: [] }>();

const { t, locale } = useI18n();
const localePath = useLocalePath();
const { profile, save, generatePlan } = await useHomeProfile();

type StepKind = 'single' | 'multi' | 'spaces';

interface StepOption {
  value: string;
  labelKey: string;
  hintKey?: string;
  emoji?: string;
}

/**
 * Шаг мастера: только то, что видит человек. Какие поля анкеты шаг сохраняет,
 * решает общий util `utils/homeSetupSteps.ts` — по нему же прогресс считают
 * карточка на главной и строка настроек. Порядок шагов здесь и там совпадает.
 */
interface WizardStep {
  section: 'home' | 'rhythm';
  titleKey: string;
  hintKey: string;
  kind: StepKind;
  options?: StepOption[];
}

const steps: WizardStep[] = [
  {
    section: 'home',
    titleKey: 'q1Title',
    hintKey: 'q1Hint',
    kind: 'single',
    options: [
      { value: 'apartment', labelKey: 'optApartment' },
      { value: 'house', labelKey: 'optHouse' },
      { value: 'townhouse', labelKey: 'optTownhouse' },
      { value: 'studio', labelKey: 'optStudio' },
      { value: 'other', labelKey: 'optOther' },
    ],
  },
  {
    section: 'home',
    titleKey: 'q2Title',
    hintKey: 'q2Hint',
    kind: 'single',
    options: [
      { value: '1-2', labelKey: 'optRooms12' },
      { value: '3-4', labelKey: 'optRooms34' },
      { value: '5-7', labelKey: 'optRooms57' },
      { value: '8+', labelKey: 'optRooms8' },
    ],
  },
  {
    section: 'home',
    titleKey: 'q3Title',
    hintKey: 'q3Hint',
    kind: 'single',
    options: [
      { value: 'alone', labelKey: 'optAlone' },
      { value: 'partner', labelKey: 'optPartner' },
      { value: 'family_kids', labelKey: 'optFamilyKids' },
      { value: 'roommates', labelKey: 'optRoommates' },
    ],
  },
  {
    section: 'home',
    titleKey: 'q4Title',
    hintKey: 'q4Hint',
    kind: 'multi',
    options: [
      { value: 'cats', labelKey: 'optCats', emoji: '🐱' },
      { value: 'dogs', labelKey: 'optDogs', emoji: '🐶' },
      { value: 'fish', labelKey: 'optFish', emoji: '🐟' },
      { value: 'birds', labelKey: 'optBirds', emoji: '🐦' },
      { value: 'reptiles', labelKey: 'optReptiles', emoji: '🐍' },
      { value: 'rodents', labelKey: 'optRodents', emoji: '🐹' },
    ],
  },
  /**
   * Один шаг вместо трёх.
   *
   * Раньше это были «есть балкон или двор?» (один из двух), «есть детская?» и
   * «есть гараж?» (два переключателя да/нет) — три экрана ради одного смысла
   * «какие ещё помещения есть в доме». Теперь это мультивыбор, как у питомцев:
   * отметил — задача появится, не отметил — её нет.
   */
  {
    section: 'home',
    titleKey: 'q5Title',
    hintKey: 'q5Hint',
    kind: 'spaces',
    options: [
      { value: 'kidsRoom', labelKey: 'optSpaceKidsRoom', emoji: '🧸' },
      { value: 'balcony', labelKey: 'optSpaceBalcony', emoji: '🪴' },
      { value: 'yard', labelKey: 'optSpaceYard', emoji: '🌳' },
      { value: 'garage', labelKey: 'optSpaceGarage', emoji: '🚗' },
    ],
  },
  {
    section: 'rhythm',
    titleKey: 'q8Title',
    hintKey: 'q8Hint',
    kind: 'single',
    options: [
      { value: 'light', labelKey: 'optLevelLight', hintKey: 'optLevelLightHint' },
      { value: 'normal', labelKey: 'optLevelNormal', hintKey: 'optLevelNormalHint' },
      { value: 'deep', labelKey: 'optLevelDeep', hintKey: 'optLevelDeepHint' },
    ],
  },
  {
    section: 'rhythm',
    titleKey: 'q9Title',
    hintKey: 'q9Hint',
    kind: 'single',
    options: [
      { value: 'under30', labelKey: 'optTimeUnder30' },
      { value: '30to60', labelKey: 'optTime30to60' },
      { value: 'depends', labelKey: 'optTimeDepends' },
    ],
  },
];

const index = ref(0);
const answers = reactive<Record<string, unknown>>({});
const planning = ref(false);
const plan = ref<HomePlan | null>(null);
const failure = ref(false);

/**
 * Черновик ответов: переживает закрытие вкладки и обрыв сети.
 *
 * Ключ версионирован — при смене набора шагов старый черновик должен быть
 * проигнорирован целиком, а не прочитан наполовину.
 */
const DRAFT_KEY = 'tidyplan-setup-draft-v2';

interface SetupDraft {
  step: number;
  answers: Record<string, unknown>;
}

const saveDraft = () => {
  if (!import.meta.client) return;

  try {
    const draft: SetupDraft = { step: index.value, answers: { ...answers } };

    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Приватный режим: мастер работает, просто без черновика.
  }
};

const clearDraft = () => {
  if (!import.meta.client) return;

  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Нечего чистить — и хорошо.
  }
};

const readDraft = (): SetupDraft | null => {
  if (!import.meta.client) return null;

  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SetupDraft>;

    if (!parsed || typeof parsed !== 'object' || typeof parsed.answers !== 'object') {
      return null;
    }

    return {
      step: typeof parsed.step === 'number' ? Math.min(parsed.step, steps.length - 1) : 0,
      answers: parsed.answers as Record<string, unknown>,
    };
  } catch {
    return null;
  }
};

/** `steps[index]` типизирован как возможно пустой, поэтому подстраховываемся. */
const current = computed<WizardStep>(() => {
  const step = steps[index.value];

  return step ?? (steps[steps.length - 1] as WizardStep);
});
const total = steps.length;
const progress = computed(() => (index.value + 1) / total);
const sectionKey = computed(() =>
  current.value.section === 'home' ? 'sectionHome' : 'sectionRhythm',
);

/** Поля текущего шага: правило «шаг → поля» общее с карточкой и настройками. */
const currentFields = computed<readonly HomeSetupField[]>(() => HOME_SETUP_STEP_FIELDS[index.value] ?? []);

/** Основное поле шага: у шага «помещения» их три, и первым идёт «детская». */
const currentField = computed<HomeSetupField>(() => currentFields.value[0] ?? 'housingType');

/**
 * Помещения читаются и пишутся в три разных поля анкеты: детская и гараж — это
 * boolean, балкон и двор — значение `outdoor`. На экране это один мультивыбор,
 * поэтому сопоставление живёт здесь, а не в разметке.
 */
const SPACE_FIELDS = {
  kidsRoom: 'hasKidsRoom',
  balcony: 'outdoor',
  yard: 'outdoor',
  garage: 'hasGarage',
} as const;

type SpaceValue = keyof typeof SPACE_FIELDS;

const isSpaceSelected = (space: SpaceValue): boolean => {
  if (space === 'kidsRoom') return answers.hasKidsRoom === true;
  if (space === 'garage') return answers.hasGarage === true;

  return answers.outdoor === space;
};

const toggleSpace = (space: SpaceValue) => {
  const selected = isSpaceSelected(space);

  if (space === 'kidsRoom') {
    answers.hasKidsRoom = !selected;
    return;
  }

  if (space === 'garage') {
    answers.hasGarage = !selected;
    return;
  }

  // Балкон и двор взаимоисключающие: в анкете `outdoor` — одно значение.
  answers.outdoor = selected ? 'none' : space;
};

/** Сколько помещений отмечено: по нему решается «Далее» или «Пропустить». */
const selectedSpaces = computed(
  () => (Object.keys(SPACE_FIELDS) as SpaceValue[]).filter(isSpaceSelected).length,
);

/** Ответ на текущем шаге: от него зависит, «Далее» или «Пропустить» на кнопке. */
const answered = computed(() => {
  if (current.value.kind === 'spaces') {
    return selectedSpaces.value > 0;
  }

  const value = answers[currentField.value];

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== null && value !== undefined && value !== '';
});

const isSelected = (field: string, value: string) => answers[field] === value;

const multiValues = (field: string): string[] => (answers[field] as string[] | undefined) ?? [];

const toggleMulti = (field: string, value: string) => {
  const list = [...multiValues(field)];

  if (value === 'none') {
    answers[field] = list.includes('none') ? [] : ['none'];
    return;
  }

  const withoutNone = list.filter((item) => item !== 'none');
  answers[field] = withoutNone.includes(value)
    ? withoutNone.filter((item) => item !== value)
    : [...withoutNone, value];
};

const pick = (field: string, value: string) => {
  answers[field] = value;
};

/** В плане показываем только дни, куда реально попали задачи. */
const planDays = computed(() => (plan.value?.days ?? []).filter((day) => day.tasks.length > 0));

/** Ключ подписи дня: в i18n дни идут с понедельника, а в данных воскресенье — 0. */
const dayLabelKey = (dayOfWeek: number) => `homeSetup.day${dayOfWeek === 0 ? 7 : dayOfWeek}`;

/**
 * Открытие мастера: берём черновик, если он есть, иначе — сохранённую анкету.
 *
 * Черновик приоритетнее: он новее и содержит то, что человек уже выбрал, но не
 * успел сохранить. После успешной сборки плана черновик стирается, поэтому
 * повторное открытие снова показывает сохранённую анкету.
 */
watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }

    plan.value = null;
    failure.value = false;

    const draft = readDraft();

    for (const fields of HOME_SETUP_STEP_FIELDS) {
      for (const field of fields) {
        const stored = draft ? draft.answers[field] : profile.value?.[field];

        answers[field] = Array.isArray(stored) ? [...stored] : (stored ?? null);
      }
    }

    index.value = draft?.step ?? 0;
  },
  { immediate: true },
);

/**
 * Финиш: один `PUT` со всеми ответами, потом сборка плана.
 *
 * До этого шага на сервере ничего не менялось — поэтому «закрыть без сохранения»
 * работает буквально, а не «почти».
 */
const finish = async () => {
  planning.value = true;
  failure.value = false;

  try {
    await save({ ...answers } as Partial<HomeProfile>, { complete: true });
    plan.value = await generatePlan();
    clearDraft();
    emit('planReady');
    await refreshNuxtData(['today-plan', 'stats-week', 'stats-month', 'stats-all']);
  } catch {
    // Черновик не стираем: ответы остаются и после неудачи.
    failure.value = true;
  } finally {
    planning.value = false;
  }
};

/** «Далее»: запоминает ответы локально и ведёт к следующему шагу. */
const next = async () => {
  saveDraft();

  if (index.value === total - 1) {
    await finish();
    return;
  }

  index.value += 1;
};

/** «Назад»: шаг влево без потери ответов; с первого шага уводит из мастера. */
const back = () => {
  if (index.value === 0) {
    close();
    return;
  }

  index.value -= 1;
  saveDraft();
};

const skip = () => {
  saveDraft();
  void next();
};

const close = () => emit('close');
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="wizard" role="dialog" aria-modal="true">
      <div class="wizard__panel">
        <header class="wizard__head">
          <span class="wizard__section">{{ t(`homeSetup.${sectionKey}`) }}</span>
          <span class="wizard__count">{{ t('homeSetup.stepOf', { current: index + 1, total }) }}</span>

          <!--
            Крестик закрывает мастер **без сохранения**: ответы копятся локально
            и уходят на сервер только в конце, поэтому закрыть — значит не
            изменить ничего. Черновик остаётся, чтобы вернуться к тому же шагу.
          -->
          <button
            type="button"
            class="wizard__close"
            :aria-label="t('homeSetup.close')"
            @click="close"
          >
            <i class="pi pi-times" aria-hidden="true" />
          </button>
        </header>

        <div class="progress" aria-hidden="true">
          <span
            v-for="segment in 4"
            :key="segment"
            class="progress__track"
          >
            <span
              class="progress__fill"
              :style="{ width: `${Math.min(1, Math.max(0, progress * 4 - (segment - 1))) * 100}%` }"
            />
          </span>
        </div>

        <!-- Результат: план собран -->
        <section v-if="plan" class="wizard__body">
          <h2 class="wizard__title">{{ t('homeSetup.planReady') }}</h2>
          <p class="wizard__hint">{{ t('homeSetup.planHint') }}</p>

          <ul class="summary">
            <li><span>{{ t('homeSetup.planTasks') }}</span><strong>{{ plan.summary.totalTasks }}</strong></li>
            <li><span>{{ t('homeSetup.planMinutes') }}</span><strong>{{ formatMinutes(plan.summary.totalMinutes, locale) }}</strong></li>
            <li><span>{{ t('homeSetup.planPerDay') }}</span><strong>{{ formatMinutes(plan.summary.minutesPerDay, locale) }}</strong></li>
          </ul>

          <ol class="days">
            <li v-for="day in planDays" :key="day.dayOfWeek" class="days__row">
              <span class="days__name">{{ t(dayLabelKey(day.dayOfWeek)) }}</span>
              <span class="days__value">
                {{ day.tasks.length }} · {{ formatMinutes(day.totalMinutes, locale) }}
              </span>
            </li>
          </ol>

          <!--
            Примечания генератора («недельных дел больше, чем помещается»,
            «полы масштабированы по числу комнат») на экран не выводим: это
            служебная информация для проверок, а человеку она ничего не объясняет
            и только пугает цифрами. Данные остаются в ответе API.
          -->

          <AppButton variant="filled" block :to="localePath('/')" @click="close">
            {{ t('homeSetup.openPlan') }}
          </AppButton>
        </section>

        <!-- Шаги мастера -->
        <section v-else class="wizard__body">
          <h2 class="wizard__title">{{ t(`homeSetup.${current.titleKey}`) }}</h2>
          <p class="wizard__hint">{{ t(`homeSetup.${current.hintKey}`) }}</p>

          <!-- Один вариант из списка -->
          <ul v-if="current.kind === 'single'" class="options">
            <li v-for="option in current.options" :key="option.value">
              <button
                type="button"
                class="option"
                :class="{ 'option--active': isSelected(currentField, option.value) }"
                @click="pick(currentField, option.value)"
              >
                <span class="option__text">
                  <span class="option__label">{{ t(`homeSetup.${option.labelKey}`) }}</span>
                  <span v-if="option.hintKey" class="option__hint">{{ t(`homeSetup.${option.hintKey}`) }}</span>
                </span>
                <span class="badge" :class="{ 'badge--on': isSelected(currentField, option.value) }">
                  <i class="pi pi-check" aria-hidden="true" />
                </span>
              </button>
            </li>
          </ul>

          <!-- Мультивыбор: питомцы -->
          <template v-else-if="current.kind === 'multi'">
            <ul class="grid">
              <li v-for="option in current.options" :key="option.value">
                <button
                  type="button"
                  class="option option--grid"
                  :class="{ 'option--active': multiValues(currentField).includes(option.value) }"
                  @click="toggleMulti(currentField, option.value)"
                >
                  <span aria-hidden="true">{{ option.emoji }}</span>
                  <span class="option__label">{{ t(`homeSetup.${option.labelKey}`) }}</span>
                  <span
                    class="badge"
                    :class="{ 'badge--on': multiValues(currentField).includes(option.value) }"
                  >
                    <i
                      :class="['pi', multiValues(currentField).includes(option.value) ? 'pi-check' : 'pi-plus']"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </li>
            </ul>

            <button
              type="button"
              class="pill"
              :class="{ 'pill--active': multiValues(currentField).includes('none') }"
              @click="toggleMulti(currentField, 'none')"
            >
              {{ t('homeSetup.optNoPets') }}
            </button>
          </template>

          <!-- Помещения: один мультивыбор вместо трёх шагов -->
          <template v-else-if="current.kind === 'spaces'">
            <ul class="grid">
              <li v-for="option in current.options" :key="option.value">
                <button
                  type="button"
                  class="option option--grid"
                  :class="{ 'option--active': isSpaceSelected(option.value as SpaceValue) }"
                  @click="toggleSpace(option.value as SpaceValue)"
                >
                  <span aria-hidden="true">{{ option.emoji }}</span>
                  <span class="option__label">{{ t(`homeSetup.${option.labelKey}`) }}</span>
                  <span class="badge" :class="{ 'badge--on': isSpaceSelected(option.value as SpaceValue) }">
                    <i
                      :class="['pi', isSpaceSelected(option.value as SpaceValue) ? 'pi-check' : 'pi-plus']"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </li>
            </ul>

            <p class="hint">{{ t('homeSetup.spacesHint') }}</p>
          </template>

          <p v-if="failure" class="wizard__error">{{ t('state.error') }}</p>
        </section>

        <footer v-if="!plan" class="wizard__foot">
          <AppButton
            v-if="index > 0"
            variant="outline"
            :disabled="planning"
            @click="back"
          >
            {{ t('homeSetup.back') }}
          </AppButton>

          <AppButton
            :variant="answered ? 'filled' : 'outline'"
            block
            :disabled="planning"
            @click="answered ? next() : skip()"
          >
            {{
              planning
                ? t('state.loading')
                : index === total - 1
                  ? t('homeSetup.finish')
                  : answered
                    ? t('homeSetup.next')
                    : t('homeSetup.skip')
            }}
          </AppButton>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.wizard {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  flex-direction: column;
  background: var(--c-bg);
}

/*
 * Панель — единственная «поверхность» мастера: на телефоне она занимает окно
 * целиком, на десктопе (медиазапрос ниже) становится карточкой по центру.
 * Прокрутка убрана с `.wizard` в тело шага, поэтому шапка, прогресс и кнопка
 * «Далее» всегда на виду.
 */
.wizard__panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  background: var(--c-bg);
}

.wizard__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3) var(--space-2);
}

.wizard__close {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text);
  font-size: 1.1rem;
  cursor: pointer;
}

.wizard__section {
  flex: 1;
  text-align: center;
  font-weight: 600;
}

.wizard__count {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.progress {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
  padding: 0 var(--space-3);
}

.progress__track {
  height: 4px;
  border-radius: 999px;
  background: var(--c-border);
  overflow: hidden;
}

.progress__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--c-brand);
  transition: width 0.2s ease;
}

.wizard__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* Прокрутка шага не «утекает» на страницу под диалогом */
  overscroll-behavior: contain;
  padding: var(--space-3);
}

.wizard__title {
  font-size: var(--fs-title);
  line-height: var(--lh-tight);
}

.wizard__hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.options,
.grid,
.extras {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
}

.option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 48px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.option--grid {
  flex-wrap: wrap;
  gap: var(--space-2);
}

.option--active {
  border-color: var(--c-brand);
  background: var(--c-surface-warm);
  color: var(--c-brand);
}

.option__text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.option__label {
  flex: 1;
  min-width: 0;
}

.option__hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.badge {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 999px;
  background: var(--c-surface-sunken);
  color: var(--c-text-muted);
  font-size: 0.65rem;
}

.badge--on {
  background: var(--c-brand);
  color: #fff;
}

.pill {
  align-self: center;
  min-height: var(--tap-min);
  padding: 0 var(--space-5);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  cursor: pointer;
}

.pill--active {
  border-color: var(--c-brand);
  color: var(--c-brand);
}

.extra {
  padding: var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
}

.extra__label {
  margin-bottom: var(--space-2);
}

.extra__switch {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-1);
  padding: 3px;
  border-radius: var(--r-chip);
  background: var(--c-surface-sunken);
}

.toggle {
  min-height: 40px;
  border: none;
  border-radius: var(--r-chip);
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  cursor: pointer;
}

.toggle--on {
  background: var(--c-surface-warm);
  color: var(--c-brand);
  font-weight: 600;
}

.summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.summary li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface-mint);
}

.days {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.days__row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface);
  font-size: var(--fs-caption);
}

.days__value {
  color: var(--c-text-muted);
}

.wizard__error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}

/*
 * Подвал с кнопкой. `position: sticky` больше не нужен: панель не
 * прокручивается, прокручивается только тело шага, поэтому кнопка и так
 * остаётся внизу окна на телефоне и внизу карточки на десктопе.
 */
.wizard__foot {
  flex: 0 0 auto;
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-3) calc(var(--space-3) + env(safe-area-inset-bottom));
  background: var(--c-bg);
}

/*
 * «Назад» не растягивается: главная кнопка — «Далее», и она должна занимать
 * всё оставшееся место. Своя ширина у «Назад» держит её короткой и на десктопе,
 * где карточка шире телефона.
 */
.wizard__foot > .btn:first-child:not(:last-child) {
  flex: 0 0 auto;
}

@media (min-width: 768px) {
  /* Десктоп: затемнённый фон на всё окно, внутри — карточка по центру */
  .wizard {
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
    background: rgb(12 18 16 / 45%);
  }

  .wizard__panel {
    flex: 0 1 auto;
    width: min(560px, 100%);
    max-height: min(88vh, 760px);
    border-radius: var(--r-card);
    box-shadow: var(--shadow-lift);
  }
}
</style>
