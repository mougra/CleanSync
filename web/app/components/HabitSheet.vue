<script setup lang="ts">
/**
 * Лист «Добавить привычку» с двумя вкладками: готовые идеи из каталога и своя
 * привычка.
 *
 * Раньше это были два разных листа и две кнопки в интерфейсе — «Выбрать
 * привычку» и «Создать свою». Человек, который ещё не знает, чего хочет,
 * оказывался перед выбором из двух непонятных входов. Теперь вход один, а
 * вкладки объясняют, что внутри: сначала идеи (готовый список), потом своя
 * привычка (пустая форма).
 *
 * Режим правки (`habit`) вкладок не показывает: редактируется конкретная
 * привычка, выбирать нечего, и лист сразу открывается формой.
 */
import type {
  Habit,
  HabitCategoryCount,
  HabitIntervalUnit,
  HabitTemplate,
} from '~/types/habit';

const props = defineProps<{
  open: boolean;
  /** Открыт для существующей привычки — лист работает как правка. */
  habit?: Habit | null;
  templates: HabitTemplate[];
  categories: HabitCategoryCount[];
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const { t } = useI18n();
const api = useApi();
const { categoryLabel, intervalLabel } = useHabitLabels();

/** Вкладка листа: `ideas` — каталог, `own` — своя привычка. */
const tab = ref<'ideas' | 'own'>('ideas');

/** Режим правки: лист открыт для существующей привычки. */
const isEdit = computed(() => Boolean(props.habit));

/* ── Каталог идей ─────────────────────────────────────────────────────── */
const query = ref('');
const category = ref('all');
const selected = ref<number[]>([]);
const adding = ref(false);
const ideasError = ref('');

const filtered = computed(() => {
  const search = query.value.trim().toLowerCase();

  return props.templates.filter((template) => {
    const matchesCategory = category.value === 'all' || template.category === category.value;
    const matchesSearch =
      !search ||
      template.title.toLowerCase().includes(search) ||
      (template.description ?? '').toLowerCase().includes(search);

    return matchesCategory && matchesSearch;
  });
});

const toggleSelected = (id: number) => {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((item) => item !== id)
    : [...selected.value, id];
};

/* ── Своя привычка ────────────────────────────────────────────────────── */
const title = ref('');
const zone = ref('');
const intervalCount = ref(1);
const intervalUnit = ref<HabitIntervalUnit>('day');
const dueDate = ref('');
const reminderEnabled = ref(false);
const reminderTime = ref('19:00');
const pending = ref(false);
const formError = ref('');
const frequencyOpen = ref(false);

const units: HabitIntervalUnit[] = ['once', 'month', 'week', 'day'];

/**
 * Подпись поля срока — только название.
 *
 * Дату в подписи не повторяем: во второй колонке уже стоит выбранный день или
 * «Без даты». Раньше здесь был `new Date()` — подпись показывала день браузера,
 * а значение приходило из модели, и на сервере с клиентом они расходились
 * (Vue ругался на hydration mismatch после местной полуночи).
 */
const dueLabel = computed(() => t('habits.dueDate'));

const step = (delta: number) => {
  intervalCount.value = Math.min(30, Math.max(1, intervalCount.value + delta));
};

/** Сбросить обе вкладки: лист закрылся или переоткрылся для другой привычки. */
const reset = () => {
  tab.value = 'ideas';
  query.value = '';
  category.value = 'all';
  selected.value = [];
  ideasError.value = '';

  title.value = '';
  zone.value = '';
  intervalCount.value = 1;
  intervalUnit.value = 'day';
  dueDate.value = '';
  reminderEnabled.value = false;
  reminderTime.value = '19:00';
  frequencyOpen.value = false;
  formError.value = '';
};

const addSelected = async () => {
  if (selected.value.length === 0 || adding.value) {
    return;
  }

  adding.value = true;
  ideasError.value = '';

  try {
    for (const templateId of selected.value) {
      await api.request('/api/habits', { method: 'POST', body: { templateId } });
    }

    selected.value = [];
    emit('saved');
  } catch {
    // Ошибку показываем в листе: закрыть его молча значило бы потерять выбор.
    ideasError.value = t('habits.saveFailed');
  } finally {
    adding.value = false;
  }
};

const submitOwn = async () => {
  if (!title.value.trim() || pending.value) {
    return;
  }

  pending.value = true;
  formError.value = '';

  try {
    const body = {
      title: title.value.trim(),
      zone: zone.value.trim() || null,
      intervalCount: intervalCount.value,
      intervalUnit: intervalUnit.value,
      dueDate: dueDate.value || null,
      reminderEnabled: reminderEnabled.value,
      reminderTime: reminderEnabled.value ? reminderTime.value : null,
    };

    if (props.habit) {
      await api.request(`/api/habits/${props.habit.id}`, { method: 'PATCH', body });
    } else {
      await api.request('/api/habits', { method: 'POST', body });
    }

    emit('saved');
  } catch {
    formError.value = t('habits.saveFailed');
  } finally {
    pending.value = false;
  }
};

/** Заголовок и подпись зависят от режима и вкладки. */
const heading = computed(() => {
  if (isEdit.value) {
    return t('habits.editTitle');
  }

  return t('habits.add');
});

const subtitle = computed(() => {
  if (isEdit.value) {
    return null;
  }

  return tab.value === 'ideas' ? t('habits.ideasSubtitle') : t('habits.ownSubtitle');
});

watch(
  [() => props.open, () => props.habit],
  ([open]) => {
    if (!open) {
      reset();
      return;
    }

    // Правка: заполняем форму текущими значениями привычки. Периодичность
    // раскрыта сразу — иначе «Каждый день» выглядел единственным вариантом.
    const habit = props.habit;

    if (habit) {
      title.value = habit.title;
      zone.value = habit.zone ?? '';
      intervalCount.value = habit.intervalCount;
      intervalUnit.value = habit.intervalUnit;
      dueDate.value = habit.dueDate ?? '';
      reminderEnabled.value = habit.reminderEnabled;
      reminderTime.value = habit.reminderTime ?? '19:00';
      frequencyOpen.value = true;
    } else {
      tab.value = 'ideas';
    }
  },
  { immediate: true },
);
</script>

<template>
  <AppSheet :open="open" @close="emit('close')">
    <template #header>
      <div class="head">
        <div class="head__row">
          <span class="head__icon" aria-hidden="true">
            <i :class="['pi', tab === 'ideas' && !isEdit ? 'pi-sparkles' : 'pi-pencil']" />
          </span>

          <div class="head__text">
            <h2 class="head__title">{{ heading }}</h2>
            <p v-if="subtitle" class="head__subtitle">{{ subtitle }}</p>
          </div>
        </div>

        <!--
          Вкладки только при добавлении: в правке выбирать нечего, и переключатель
          отвлекал бы от формы.
        -->
        <div v-if="!isEdit" class="tabs" role="tablist">
          <button
            id="habit-tab-ideas"
            type="button"
            class="tabs__item"
            :class="{ 'tabs__item--active': tab === 'ideas' }"
            role="tab"
            :aria-selected="tab === 'ideas'"
            aria-controls="habit-panel-ideas"
            @click="tab = 'ideas'"
          >
            <i class="pi pi-sparkles" aria-hidden="true" />
            {{ t('habits.tabIdeas') }}
          </button>

          <button
            id="habit-tab-own"
            type="button"
            class="tabs__item"
            :class="{ 'tabs__item--active': tab === 'own' }"
            role="tab"
            :aria-selected="tab === 'own'"
            aria-controls="habit-panel-own"
            @click="tab = 'own'"
          >
            <i class="pi pi-pencil" aria-hidden="true" />
            {{ t('habits.tabOwn') }}
          </button>
        </div>
      </div>
    </template>

    <!-- ── Идеи из каталога ──────────────────────────────────────────── -->
    <div
      v-if="tab === 'ideas' && !isEdit"
      id="habit-panel-ideas"
      class="picker"
      role="tabpanel"
      aria-labelledby="habit-tab-ideas"
    >
      <label class="search">
        <i class="pi pi-search" aria-hidden="true" />
        <input
          v-model="query"
          class="search__input"
          type="search"
          :placeholder="t('habits.searchPlaceholder')"
        >
      </label>

      <div class="chips">
        <button
          type="button"
          class="chip"
          :class="{ 'chip--active': category === 'all' }"
          @click="category = 'all'"
        >
          {{ t('habitCategory.all') }}
        </button>
        <button
          v-for="item in categories"
          :key="item.category"
          type="button"
          class="chip"
          :class="{ 'chip--active': category === item.category }"
          @click="category = item.category"
        >
          {{ categoryLabel(item.category) }}
        </button>
      </div>

      <p v-if="!filtered.length" class="empty">{{ t('habits.nothingFound') }}</p>

      <ul class="cards">
        <li v-for="template in filtered" :key="template.id">
          <button
            type="button"
            class="card"
            :class="{ 'card--selected': selected.includes(template.id) }"
            :aria-pressed="selected.includes(template.id)"
            @click="toggleSelected(template.id)"
          >
            <span class="card__icon" aria-hidden="true">
              <i :class="['pi', template.icon ?? 'pi-check-circle']" />
            </span>

            <span class="card__body">
              <span class="card__title">{{ template.title }}</span>
              <small class="card__text">{{ template.description }}</small>
              <small class="card__meta">
                {{ categoryLabel(template.category) }} ·
                {{ intervalLabel(template.interval_count, template.interval_unit) }}
              </small>
            </span>

            <span class="card__radio" aria-hidden="true">
              <i v-if="selected.includes(template.id)" class="pi pi-check" />
            </span>
          </button>
        </li>
      </ul>

      <p v-if="ideasError" class="error" role="alert">{{ ideasError }}</p>
    </div>

    <form
      v-else
      id="habit-panel-own"
      class="form"
      :role="isEdit ? undefined : 'tabpanel'"
      :aria-labelledby="isEdit ? undefined : 'habit-tab-own'"
      @submit.prevent="submitOwn"
    >
      <label class="field">
        <span class="field__label">{{ t('habits.fieldTitle') }}</span>
        <input
          v-model="title"
          class="field__input"
          type="text"
          maxlength="120"
          :placeholder="t('habits.fieldTitlePlaceholder')"
          required
        >
      </label>

      <label class="field">
        <span class="field__label">{{ t('habits.fieldZone') }}</span>
        <input
          v-model="zone"
          class="field__input"
          type="text"
          maxlength="120"
          :placeholder="t('habits.fieldZonePlaceholder')"
        >
      </label>

      <section class="panel">
        <button type="button" class="row" @click="frequencyOpen = !frequencyOpen">
          <span class="row__icon" aria-hidden="true"><i class="pi pi-refresh" /></span>
          <span class="row__label">{{ intervalLabel(intervalCount, intervalUnit) }}</span>
          <i :class="['pi', frequencyOpen ? 'pi-chevron-up' : 'pi-chevron-down']" aria-hidden="true" />
        </button>

        <div v-if="frequencyOpen" class="frequency">
          <div class="segmented" role="group">
            <button
              v-for="unit in units"
              :key="unit"
              type="button"
              class="segmented__item"
              :class="{ 'segmented__item--active': intervalUnit === unit }"
              :aria-pressed="intervalUnit === unit"
              @click="intervalUnit = unit"
            >
              {{ unit === 'once' ? t('habitInterval.once') : t(`habitUnit.${unit}`) }}
            </button>
          </div>

          <div v-if="intervalUnit !== 'once'" class="stepper">
            <button type="button" class="stepper__btn" :aria-label="'-'" @click="step(-1)">
              <i class="pi pi-minus" aria-hidden="true" />
            </button>
            <span class="stepper__value">{{ intervalCount }}</span>
            <button type="button" class="stepper__btn" :aria-label="'+'" @click="step(1)">
              <i class="pi pi-plus" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <div class="panel">
        <AppDateField v-model="dueDate" :label="dueLabel" />
      </div>

      <div class="panel row">
        <span class="row__icon" aria-hidden="true"><i class="pi pi-bell" /></span>
        <span class="row__label">
          {{ t('habits.reminder') }}: {{ reminderEnabled ? t('habits.reminderOn') : t('habits.reminderOff') }}
        </span>
        <input
          v-if="reminderEnabled"
          v-model="reminderTime"
          class="row__date"
          type="time"
          :aria-label="t('habits.reminderTime')"
        >
        <button
          type="button"
          class="row__switch"
          :aria-pressed="reminderEnabled"
          :aria-label="t('habits.reminder')"
          @click="reminderEnabled = !reminderEnabled"
        >
          <span class="switch" :class="{ 'switch--on': reminderEnabled }" aria-hidden="true">
            <span class="switch__dot" />
          </span>
        </button>
      </div>

      <p v-if="formError" class="error" role="alert">{{ formError }}</p>
    </form>

    <template #footer>
      <AppButton
        v-if="tab === 'ideas' && !isEdit"
        variant="accent"
        block
        :disabled="selected.length === 0 || adding"
        @click="addSelected"
      >
        {{ t('habits.addSelected') }} ({{ selected.length }})
      </AppButton>

      <AppButton
        v-else
        variant="filled"
        block
        :disabled="!title.trim() || pending"
        @click="submitOwn"
      >
        {{ isEdit ? t('habits.saveChanges') : t('habits.save') }}
        <i class="pi pi-arrow-right" aria-hidden="true" />
      </AppButton>
    </template>
  </AppSheet>
</template>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.head__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.head__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: var(--r-chip);
  background: var(--c-surface);
  color: var(--c-brand);
}

.head__text {
  min-width: 0;
}

.head__title {
  font-size: var(--fs-title);
}

.head__subtitle {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

/* Вкладки: две равные кнопки, активная — заливкой бренда */
.tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.tabs__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text-muted);
  font: inherit;
  font-size: var(--fs-caption);
  font-weight: 600;
  cursor: pointer;
}

.tabs__item--active {
  border-color: transparent;
  background: var(--c-brand);
  color: var(--c-onbrand);
}

/* ── Идеи ──────────────────────────────────────────────────────────── */
.picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  min-height: 52px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text-muted);
}

.search__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--c-text);
  font: inherit;
  outline: none;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip {
  min-height: 40px;
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
}

.chip--active {
  border-color: transparent;
  background: var(--c-brand);
  color: var(--c-onbrand);
  font-weight: 600;
}

.cards {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.card--selected {
  border-color: var(--c-brand);
  background: var(--c-surface-mint);
}

.card__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: var(--r-chip);
  background: var(--c-surface-mint);
  color: var(--c-brand);
}

.card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.card__title {
  font-weight: 600;
  line-height: 1.3;
}

.card__text,
.card__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.card__radio {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border: 1.5px solid var(--c-track);
  border-radius: var(--r-pill);
  color: var(--c-brand);
  font-size: 0.7rem;
}

.card--selected .card__radio {
  border-color: var(--c-brand);
  background: var(--c-brand);
  color: var(--c-onbrand);
}

.empty {
  color: var(--c-text-muted);
  text-align: center;
  padding: var(--space-5) 0;
}

/* ── Своя привычка ─────────────────────────────────────────────────── */
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
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

.field__input {
  min-height: 52px;
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
}

.panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 60px;
  padding: 0 var(--space-4);
  border: none;
  background: transparent;
  color: var(--c-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.row__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: var(--r-chip);
  background: var(--c-accent-soft);
  color: var(--c-accent);
}

.row__label {
  flex: 1;
  min-width: 0;
}

.row__date {
  border: none;
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  font-size: var(--fs-caption);
}

.row__switch {
  display: grid;
  place-items: center;
  min-height: var(--tap-min);
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.frequency {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4) var(--space-4);
  border-top: 1px solid var(--c-border);
}

.segmented {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.segmented__item {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-chip);
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
}

.segmented__item--active {
  border-color: var(--c-accent);
  color: var(--c-accent);
  font-weight: 600;
}

.stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
}

.stepper__btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-chip);
  background: var(--c-surface-warm);
  color: var(--c-accent);
  cursor: pointer;
}

.stepper__value {
  min-width: 2ch;
  text-align: center;
  font-size: var(--fs-title);
  font-weight: 600;
}

.switch {
  width: 46px;
  height: 26px;
  flex: 0 0 46px;
  padding: 3px;
  border-radius: var(--r-pill);
  background: var(--c-track);
  transition: background-color 0.15s ease;
}

.switch--on {
  background: var(--c-brand);
}

.switch__dot {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: var(--r-pill);
  background: var(--c-surface);
  transition: transform 0.15s ease;
}

.switch--on .switch__dot {
  transform: translateX(20px);
}

.error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}
</style>
