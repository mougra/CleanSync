<script setup lang="ts">
/**
 * Главная «Сегодня» по макетам docs/design/mockups/main page 1-2.
 *
 * Публичные данные (шаблоны чек-листов, справочник достижений, список челленджей)
 * приходят во время серверного рендера. Персональные (активный челлендж, план дня,
 * заработанные достижения) — только для вошедшего: авторизация на httpOnly-cookie.
 */

import type { AchievementProgress } from '~/types/achievement';
import type { StatsPeriod } from '~/types/stats';
import type { TodayPlan, TodayPlanTask } from '~/types/task';

interface SeasonalTemplate {
  title: string;
  desc: string;
  steps: string[];
}

interface ChecklistTemplate {
  title: string;
  items: { id: number; text: string; done: boolean }[];
}

interface TemplatesResponse {
  seasonal: SeasonalTemplate[];
  checklist: ChecklistTemplate[];
}

const { t, locale } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();
const api = useApi();

/** Шторка «Добавить задачу» — та же, что открывает круглая кнопка в углу. */
const { openSheet: openTaskSheet } = useTaskSheet();

/** Анкета «Настройка по дому»: пока она не пройдена, пустой план предлагает её пройти. */
const { completed: homeProfileDone } = await useHomeProfile();

const { active, current, seasonChallenge, seasonGuestProgress, guestCompletedSlug } =
  await useChallenges();

// Привычки: тот же composable, что и на вкладке «Привычки», ключи общие —
// отметка на главной сразу видна и там.
const { habits, dueToday, doneToday, refreshMine: refreshHabits } = await useHabits();
const { intervalLabel, categoryLabel } = useHabitLabels();
const habitBusy = ref<number | null>(null);

const { data: templates, error: templatesError } = await useAsyncData(
  'templates',
  () => api.request<TemplatesResponse>('/api/templates'),
  { default: () => ({ seasonal: [], checklist: [] }) },
);

// Достижения: прогресс по каждому — из общего composable (тот же ключ, что
// на экране достижений), гостю показываем справочник без прогресса.
const { catalog: achievementsCatalog, progress: achievementsProgress, earned: achievementsEarned, total: achievementsTotal } =
  await useAchievements();
const { show: showAchievements } = useAchievementToast();

const { data: today } = await useAsyncData('today-plan', () =>
  auth.isAuthenticated ? api.request<TodayPlan>('/api/tasks/today') : Promise.resolve(null),
);

/**
 * Задачи плана дня читаются только у «Сегодня»: остальные дни открываются
 * шторкой календаря (`PlanDaySheet`) и берут свой день из `GET /api/tasks/calendar`,
 * поэтому кэш «сегодня» с другими днями не смешивается.
 */

const checklists = computed(() => templates.value?.checklist ?? []);
const checklistTasksTotal = computed(() =>
  checklists.value.reduce((sum, checklist) => sum + checklist.items.length, 0),
);

const showcase = computed<AchievementProgress[]>(() =>
  auth.isAuthenticated
    ? achievementsProgress.value.slice(0, 2)
    : achievementsCatalog.value.slice(0, 2).map((item) => ({ ...item, current: 0, earned: false })),
);

/**
 * Челлендж сезона закрыт — до следующего сезона на главной его нет.
 * У вошедшего это состояние сервера, у гостя — отметка в localStorage:
 * `useChallenges` сводит оба случая к одному признаку.
 */
const challengeCompleted = computed(
  () => current.value.status === 'completed' || guestCompletedSlug.value !== null,
);

/**
 * Прогресс сезонного челленджа на карточке: у вошедшего он приходит с сервера
 * вместе с состоянием, у гостя считается по локальным отметкам. Если гость ещё
 * ничего не отметил, показываем описание — так же, как для незапущенного челленджа.
 */
const seasonCardProgress = computed(() => {
  const state = current.value;

  if (!('progress' in state) || !state.progress) {
    return null;
  }

  const progress = auth.isAuthenticated ? state.progress : seasonGuestProgress.value;

  if (!progress) {
    return null;
  }

  return !auth.isAuthenticated && progress.done === 0 ? null : progress;
});

/** «День 3: осталось 55 мин» на карточке сезонного челленджа. */
const seasonCardNote = computed(() => {
  const progress = seasonCardProgress.value;

  if (!progress?.currentDay) {
    return null;
  }

  return t('home.dayLeft', { day: progress.currentDay, minutes: progress.minutesLeft });
});

/**
 * «План на сегодня» — только свои задачи и план по дому.
 *
 * Задачи челленджа сюда не подмешиваются: челлендж — отдельная сущность, и
 * живёт он в своей карточке. Раньше задачи дня челленджа попадали в чипы плана,
 * из-за чего один и тот же пункт виделся в двух местах.
 */
const planTotal = computed(() => today.value?.summary.total_tasks ?? 0);
const planDone = computed(() => today.value?.summary.completed_tasks ?? 0);
const planMinutes = computed(() => today.value?.summary.total_estimated_time ?? 0);

/**
 * Локальные отметки: их видно сразу, ещё до ответа сервера.
 *
 * Ключ — id задачи, значение — новое состояние. Накладываются поверх ответа
 * `GET /api/tasks/today`, поэтому отметка не зависит от того, обновился ли уже
 * кэш `useAsyncData`; после успешного обновления накладка снимается, и на экране
 * остаётся состояние сервера.
 */
const planMarks = ref<Record<number, boolean>>({});

/** Задачи, по которым прямо сейчас идёт запрос: повторный тап по ним не проходит. */
const planBusy = ref<number[]>([]);

/** Понятная строка ошибки вместо молчаливого отката. */
const planError = ref('');

/** Периодичность из пары «частота + интервал»: «раз в неделю», «раз в 3 месяца». */
const frequencyLabel = (task: TodayPlanTask): string | null => {
  const frequency = task.frequency;

  if (!frequency) {
    return null;
  }

  if (frequency === 'once') {
    return t('plan.repeatOnce');
  }

  const count = task.interval_count ?? 1;

  if (count <= 1) {
    return frequency === 'daily'
      ? t('plan.repeatDay')
      : frequency === 'weekly'
        ? t('plan.repeatWeek')
        : t('plan.repeatMonth');
  }

  const forms =
    frequency === 'daily'
      ? [t('plan.unitDayOne'), t('plan.unitDayFew'), t('plan.unitDayMany')]
      : frequency === 'weekly'
        ? [t('plan.unitWeekOne'), t('plan.unitWeekFew'), t('plan.unitWeekMany')]
        : [t('plan.unitMonthOne'), t('plan.unitMonthFew'), t('plan.unitMonthMany')];

  // Склонения — как везде в проекте: русские формы через `pluralRu`, английские через `pluralEn`.
  const unit =
    locale.value === 'ru'
      ? pluralRu(count, forms[0]!, forms[1]!, forms[2]!)
      : pluralEn(count, forms[0]!, forms[2]!);

  return t('plan.repeatN', { count, unit });
};

/** Подпись строки: зона, источник (расписание), периодичность и время. */
const taskHint = (task: TodayPlanTask): string =>
  [
    task.room,
    task.schedule_title,
    frequencyLabel(task),
    task.estimated_minutes ? t('plan.minutes', { minutes: task.estimated_minutes }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * Пункты плана на сегодня.
 *
 * Сервер отдаёт словарь «зона → задачи», поэтому значения разворачиваем в один
 * список и сохраняем порядок сервера: отметка не должна переставлять строки.
 * Завершённые задачи остаются в списке зачёркнутыми — человек видит результат
 * своей отметки, а не пустеющий блок.
 */
const planTasks = computed(() =>
  Object.values(today.value?.tasks ?? {})
    .flat()
    .map((task) => ({
      id: task.id,
      title: task.title,
      hint: taskHint(task),
      done: planMarks.value[task.id] ?? task.is_completed,
    })),
);

/** Снять локальную накладку: дальше показываем состояние сервера. */
const clearPlanMark = (id: number) => {
  const rest: Record<number, boolean> = {};

  for (const [key, value] of Object.entries(planMarks.value)) {
    const taskId = Number(key);

    if (taskId !== id) {
      rest[taskId] = value;
    }
  }

  planMarks.value = rest;
};

/** Ответил ли сервер тем же состоянием отметки, что мы отправили. */
const serverHasMark = (id: number, value: boolean): boolean =>
  Object.values(today.value?.tasks ?? {})
    .flat()
    .some((task) => task.id === id && task.is_completed === value);

/**
 * Отметка задачи в один тап.
 *
 * Оптимистично: строка перечёркивается сразу, затем уходит `PUT /api/tasks/:id`
 * (он же считает серию и достижения). Кольцо, счётчики и минуты обновляем
 * отдельным запросом — они считаются на сервере. Если запрос не прошёл,
 * отметку откатываем и говорим об этом строкой, а не молчанием.
 */
const togglePlanTask = async (task: { id: number; done: boolean }) => {
  if (planBusy.value.includes(task.id)) {
    return;
  }

  const next = !task.done;

  planMarks.value = { ...planMarks.value, [task.id]: next };
  planBusy.value = [...planBusy.value, task.id];
  planError.value = '';

  let awarded: string[] = [];

  try {
    const response = await api.request<{ awarded?: string[] }>(`/api/tasks/${task.id}`, {
      method: 'PUT',
      body: { is_completed: next },
    });

    awarded = response.awarded ?? [];
  } catch {
    clearPlanMark(task.id);
    planError.value = t('plan.markFailed');
    return;
  } finally {
    planBusy.value = planBusy.value.filter((id) => id !== task.id);
  }

  try {
    // Отметка сохранена: подтягиваем план, серию и достижения, чтобы числа
    // на экране совпали с сервером.
    await refreshNuxtData(['today-plan', 'calendar-day', 'streak', 'achievements-progress']);
  } catch {
    // Обновление не прошло — отметку ниже оставим: она уже верна.
  }

  // Накладку снимаем, только если сервер вернул тот же ответ: иначе на экране
  // осталось бы старое состояние, хотя запись уже прошла.
  if (serverHasMark(task.id, next)) {
    clearPlanMark(task.id);
  }

  await showAchievements(awarded);
};

const tasksWidgetValue = computed(
  () => today.value?.summary.total_tasks ?? checklistTasksTotal.value,
);

/**
 * Статистика на главной берётся из того же источника, что и раздел
 * «Статистика»: числа обязаны совпадать, иначе виджет врёт.
 */
const statsPeriod = ref<StatsPeriod>('week');
const { overview: statsOverview } = await useStats(statsPeriod);
const statsValue = computed(() => statsOverview.value?.last7.tasks ?? 0);
const statsNote = computed(() => formatClock(statsOverview.value?.last7.minutes ?? 0));

/** «День 3: осталось 55 мин» для карточки активного челленджа. */
const currentDayNote = computed(() => {
  const state = active.value;
  if (!state?.progress.currentDay) {
    return null;
  }
  return t('home.dayLeft', {
    day: state.progress.currentDay,
    minutes: state.progress.minutesLeft,
  });
});

const habitMeta = (habit: { category: string | null; intervalCount: number; intervalUnit: string; streak: number }) =>
  [
    categoryLabel(habit.category),
    intervalLabel(habit.intervalCount, habit.intervalUnit as 'once' | 'day' | 'week' | 'month'),
    habit.streak > 0 ? t('habits.streak', { count: habit.streak }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

const toggleHabit = async (habit: { id: number }) => {
  if (habitBusy.value !== null) {
    return;
  }

  habitBusy.value = habit.id;
  try {
    const response = await api.request<{ awarded?: string[] }>(`/api/habits/${habit.id}/toggle`, {
      method: 'POST',
    });

    await refreshHabits();
    await refreshNuxtData('achievements-progress');
    await showAchievements(response.awarded);
  } finally {
    habitBusy.value = null;
  }
};

const { data: tip } = await useAsyncData('tip-of-the-day', () =>
  queryCollection('tips').order('order', 'ASC').first(),
);

useSeoMeta({
  title: () => t('nav.today'),
  description: () => t('home.metaDescription'),
});

const site = useSiteConfig();

/**
 * Приложение бесплатное и устанавливается на телефон, поэтому размечаем его
 * как SoftwareApplication: в выдаче это даёт строку «Бесплатно».
 */
useStructuredData(() => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${site.url}/#app`,
      name: 'TidyPlan',
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'Web',
      description: t('home.metaDescription'),
      url: site.url,
      inLanguage: 'ru-RU',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
    },
  ],
}));
</script>

<template>
  <div class="home">
    <p v-if="templatesError" class="state state--error">
      {{ t('state.error') }}<br >
      <small>{{ t('state.errorHint') }}</small>
    </p>

    <!-- Челлендж, который пользователь проходит: прогресс, полоса и текущий день -->
    <ChallengeCard
      v-if="active"
      :title="active.challenge.title"
      :badge-label="t('home.inProgress')"
      :progress="active.progress"
      :note="currentDayNote"
      :cover-url="active.challenge.cover_url"
      :to="localePath(`/challenges/${active.challenge.slug}`)"
    />

    <!--
      Сезонный челлендж, который ещё не начат: кнопки «начать» нет — задачи
      отмечаются сразу на экране челленджа, поэтому карточка просто ведёт туда.
      Гость видит её наравне с вошедшим: если он уже отметил что-то в этом
      браузере, карточка показывает его локальный прогресс.
    -->
    <ChallengeCard
      v-else-if="seasonChallenge"
      :title="seasonChallenge.title"
      :description="seasonChallenge.description"
      :badge-label="t('home.challenges')"
      :progress="seasonCardProgress"
      :note="seasonCardNote"
      :cover-url="seasonChallenge.cover_url"
      :to="localePath(`/challenges/${seasonChallenge.slug}`)"
    />

    <!-- Челлендж сезона закрыт: на главной остаётся только нейтральная строка -->
    <p v-else-if="challengeCompleted" class="home__note">{{ t('home.challengeCompleted') }}</p>

    <!--
      Приглашение пройти анкету о доме: только вошедшему и только пока анкета
      не пройдена. По ответам сервер собирает план, поэтому до анкеты план дня
      остаётся пустым — карточка объясняет, почему, и ведёт прямо в мастер.
    -->
    <HomeSetupCard
      v-if="auth.isAuthenticated && !homeProfileDone"
      :to="localePath('/settings?setup=1')"
    />

    <div class="section-head">
      <h2 class="section-head__title">{{ t('home.readyToStart') }}</h2>
      <NuxtLink :to="localePath('/challenges')" class="section-head__link">
        {{ t('home.allChallenges') }}
        <i class="pi pi-chevron-right" aria-hidden="true" />
      </NuxtLink>
    </div>

    <!-- План дня: доля закрытых задач в кольце, без «круга во весь экран» -->
    <section class="plan card">
      <div class="plan__head">
        <AppBadge variant="accent">{{ t('home.planChip') }}</AppBadge>
        <p v-if="planMinutes" class="plan__minutes">{{ planMinutes }} {{ t('home.minutes') }}</p>
      </div>

      <template v-if="auth.isAuthenticated">
        <div class="plan__body">
          <PlanRing :done="planDone" :total="planTotal" />

          <div class="plan__aside">
            <p class="plan__hint">{{ t('home.planHint') }}</p>
          </div>
        </div>

        <!--
          Пункты плана отмечаются в один тап. Завершённые строки остаются на
          месте зачёркнутыми: так виден результат отметки, а кольцо, счётчики
          и минуты обновляются тем же действием.
        -->
        <ul v-if="planTasks.length" class="plan__list">
          <li v-for="task in planTasks" :key="task.id">
            <TaskRow
              interactive
              :title="task.title"
              :hint="task.hint"
              :done="task.done"
              :disabled="planBusy.includes(task.id)"
              @toggle="togglePlanTask(task)"
            />
          </li>
        </ul>

        <!-- Пустой план: добавляем задачу или проходим настройку по дому -->
        <div v-else class="plan__empty">
          <p class="plan__empty-title">{{ t('plan.empty') }}</p>
          <p class="plan__empty-hint">{{ t('plan.emptyHint') }}</p>

          <div class="plan__empty-actions">
            <button type="button" class="plan__add" @click="openTaskSheet">
              <i class="pi pi-plus" aria-hidden="true" />
              {{ t('plan.addTask') }}
            </button>

            <NuxtLink v-if="!homeProfileDone" :to="localePath('/settings?setup=1')" class="plan__setup">
              {{ t('plan.setupLink') }}
              <i class="pi pi-chevron-right" aria-hidden="true" />
            </NuxtLink>
          </div>
        </div>

        <!-- Ошибка отметки: строка, а не молчаливый откат -->
        <p v-if="planError" class="plan__error" role="alert">{{ planError }}</p>
      </template>

      <!--
        Гость: приглашение живёт внутри карточки плана, а не отдельной карточкой
        в меню или плашкой в потоке. Закрывать его нечего — это содержимое блока,
        поэтому вместо баннера здесь короткое объяснение и два выхода.
      -->
      <template v-else>
        <div class="plan__guest">
          <div class="plan__guest-body">
            <!-- Кольцо остаётся приглушённым (0 из 0): показывает, что появится здесь -->
            <div class="plan__guest-ring" aria-hidden="true">
              <PlanRing :done="0" :total="0" />
            </div>

            <div class="plan__guest-text">
              <p class="plan__guest-title">{{ t('plan.guestTitle') }}</p>
              <p class="plan__guest-hint">{{ t('plan.guestText') }}</p>
            </div>
          </div>

          <div class="plan__guest-actions">
            <AppButton variant="accent" :to="localePath('/register')">
              {{ t('plan.guestRegister') }}
            </AppButton>
            <AppButton variant="outline" :to="localePath('/login')">
              {{ t('auth.login') }}
            </AppButton>
          </div>
        </div>
      </template>
    </section>

    <!-- Серия и недельная цель: день засчитывается за любой закрытый пункт -->
    <StreakCard v-if="auth.isAuthenticated" />

    <!-- Дом: общий план семьи и кто что делает -->
    <HouseholdCard v-if="auth.isAuthenticated" />

    <!-- Виджеты -->
    <section class="widgets">
      <article class="card card--warm widget">
        <AppBadge variant="amber">{{ t('home.weekStats') }}</AppBadge>
        <h3 class="widget__title">{{ t('home.weekStats') }}</h3>
        <p class="widget__text">{{ t('home.weekStatsHint') }}</p>
        <p class="widget__value">{{ statsValue }}</p>
        <p class="widget__caption">{{ t('home.last7') }} · {{ statsNote }}</p>
        <NuxtLink :to="localePath('/analytics')" class="widget__link">
          {{ t('home.seeProgress') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </article>

      <article class="card card--mint widget">
        <AppBadge>{{ t('home.allTasks') }}</AppBadge>
        <h3 class="widget__title">{{ t('home.taskManagement') }}</h3>
        <p class="widget__text">{{ t('home.schedule') }}</p>
        <p class="widget__value">{{ tasksWidgetValue }}</p>
        <p class="widget__caption">{{ t('home.tasks') }}</p>
        <NuxtLink :to="localePath('/checklists')" class="widget__link">
          {{ t('home.schedule') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </article>
    </section>

    <!--
      Привычки и достижения стоят рядом: на десктопе это две колонки, на телефоне
      привычный столбик. Гостю привычек не показываем, и тогда достижения
      занимают всю ширину (см. `.home__pair:has(> :only-child)`).
    -->
    <div class="home__pair">

    <!-- Привычки на сегодня: отметить можно не уходя с главной -->
    <section v-if="auth.isAuthenticated" class="card card--mint habits">
      <header class="habits__head">
        <span class="icon-box" aria-hidden="true"><i class="pi pi-refresh" /></span>
        <div class="habits__summary">
          <h2 class="card__title">{{ t('home.habitsToday') }}</h2>
          <p class="card__meta">{{ doneToday.length }}/{{ habits.length }}</p>
        </div>
        <NuxtLink :to="localePath('/habits')" class="chip-link">
          {{ t('home.allHabits') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </header>

      <p v-if="habits.length === 0" class="habits__empty">
        <NuxtLink :to="localePath('/habits')" class="habits__link">
          {{ t('home.noHabits') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </p>

      <ul v-else class="habits__list">
        <li v-for="habit in [...dueToday, ...doneToday].slice(0, 4)" :key="habit.id">
          <HabitRow
            :title="habit.title"
            :icon="habit.icon"
            :done="habit.doneToday"
            :meta="habitMeta(habit)"
            :disabled="habitBusy !== null"
            @toggle="toggleHabit(habit)"
          />
        </li>
      </ul>
    </section>

    <!-- Достижения -->
    <section class="card card--mint achievements">
      <header class="achievements__head">
        <span class="icon-box" aria-hidden="true"><i class="pi pi-trophy" /></span>
        <div class="achievements__summary">
          <h2 class="card__title">{{ t('home.achievements') }}</h2>
          <p class="card__meta">
            {{ achievementsEarned }}/{{ achievementsTotal }} {{ t('home.achievementsDone') }}
          </p>
        </div>
        <NuxtLink :to="localePath('/achievements')" class="chip-link">
          {{ t('home.seeAll') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </header>

      <ul class="achievements__list">
        <li v-for="item in showcase" :key="item.code" class="achievement">
          <span class="icon-box icon-box--surface" aria-hidden="true">
            {{ item.earned ? '🏆' : '🏅' }}
          </span>
          <div class="achievement__body">
            <strong>{{ item.name }}</strong>
            <small>{{ item.description }}</small>
            <div class="achievement__progress">
              <ProgressBar
                thin
                :value="Math.round((item.current / item.criteria_value) * 100)"
              />
              <span>{{ item.current }}/{{ item.criteria_value }}</span>
            </div>
          </div>
        </li>
      </ul>
    </section>

    </div>

    <!-- Совет дня: первый материал из web/content/tips -->
    <NuxtLink v-if="tip" class="card card--task tip" :to="localePath(tip.path)">
      <img class="tip__image" :src="tip.cover" :alt="tip.title" loading="lazy" >
      <div class="tip__body">
        <AppBadge variant="amber">{{ t('home.tipOfTheDay') }}</AppBadge>
        <h2 class="card__title">{{ tip.title }}</h2>
        <p class="card__text">{{ tip.description }}</p>
        <span class="tip__more">
          {{ t('home.seeAll') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </span>
      </div>
    </NuxtLink>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--r-card);
  transition:
    transform var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
}

/* Лёгкий подъём карточки под курсором: только там, где есть настоящий указатель */
@media (hover: hover) and (pointer: fine) {
  .card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-lift);
  }
}

@media (min-width: 768px) {
  /* Десктоп: больше воздуха и две колонки там, где раньше всё шло в столбик */
  .home {
    gap: var(--space-6);
  }

  .card {
    padding: var(--space-5);
  }
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .card:hover {
    transform: none;
    transition: none;
  }
}

.card--mint {
  background: var(--c-surface-mint);
}

.card--warm {
  background: var(--c-surface-warm);
}

/*
 * Нейтральная строка вместо карточки: челлендж сезона закрыт и до следующего
 * сезона на главной не показывается (со слов заказчика).
 */
.home__note {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.card--task {
  background: var(--c-surface-task);
}

.card__title {
  font-size: var(--fs-title);
}

.card__text,
.card__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.section-head__title {
  font-size: 1.25rem;
}

.section-head__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

.section-head__link:hover {
  color: var(--c-brand);
}

.icon-box {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  border-radius: var(--r-thumb);
  background: var(--c-bg);
  color: var(--c-brand);
  font-size: 1.25rem;
}

.icon-box--surface {
  background: var(--c-surface);
  font-size: 1.25rem;
}

.icon-box--accent {
  color: var(--c-accent);
}

/* ── План дня ───────────────────────────────────────────────────────── */
/* ── План дня ───────────────────────────────────────────────────────────
 * Раньше это был круг во всю ширину экрана: много места и мало смысла.
 * Теперь карточка с компактным кольцом, а на десктопе — две колонки.
 */
.plan {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  border-radius: var(--r-card);
  background: var(--grad-warm);
}

.plan__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.plan__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  text-align: center;
}

.plan__aside {
  display: grid;
  gap: var(--space-3);
  justify-items: center;
}

.plan__hint {
  margin: 0;
  max-width: 34ch;
  color: var(--c-text-muted);
}

.plan__minutes {
  margin: 0;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

/*
 * Гость: приглашение внутри карточки плана.
 *
 * Оформление то же, что у других блоков приложения: мягкая поверхность,
 * скругление ряда и два размытых пятна по углам (тот же приём, что в пустых
 * состояниях). Кольцо приглушено: оно показывает, что здесь появится план,
 * но не выглядит как настоящий прогресс.
 */
.plan__guest {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface);
}

.plan__guest::before,
.plan__guest::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.plan__guest::before {
  top: -80px;
  right: -50px;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, var(--c-surface-mint) 0%, transparent 70%);
}

.plan__guest::after {
  bottom: -90px;
  left: -50px;
  width: 180px;
  height: 180px;
  background: radial-gradient(circle, var(--c-accent-soft) 0%, transparent 70%);
}

/* Пятна декоративные: содержимое всегда выше них */
.plan__guest-body,
.plan__guest-actions {
  position: relative;
}

.plan__guest-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}

.plan__guest-ring {
  opacity: 0.55;
}

/* Кольцо-заглушка чуть меньше настоящего: оно здесь не главное */
.plan__guest-ring :deep(.ring) {
  width: 128px;
  height: 128px;
}

.plan__guest-ring :deep(.ring__done) {
  font-size: 1.75rem;
}

.plan__guest-text {
  display: grid;
  gap: var(--space-1);
  max-width: 42ch;
}

.plan__guest-title {
  font-size: var(--fs-title);
  font-weight: 600;
  line-height: var(--lh-tight);
}

.plan__guest-hint {
  color: var(--c-text-muted);
}

.plan__guest-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
}

/* Пункты плана — интерактивные строки в столбик: по ним же и отмечаем */
.plan__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Пустой план: короткое объяснение и два выхода — добавить задачу или настроить дом */
.plan__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface);
  text-align: center;
}

.plan__empty-title {
  font-weight: 600;
}

.plan__empty-hint {
  max-width: 36ch;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.plan__empty-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.plan__add {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-brand);
  color: var(--c-onbrand);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out);
}

.plan__add:hover {
  background: var(--c-brand-hover);
}

.plan__setup {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  color: var(--c-brand);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

/* Отметка не сохранилась: причина остаётся на экране, а не пропадает молча */
.plan__error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}

@media (prefers-reduced-motion: reduce) {
  .plan__add {
    transition: none;
  }
}

/*
 * Десктопный план: кольцо слева, текст справа, у карточки больше воздуха.
 *
 * Эти правила обязаны идти ПОСЛЕ базовых `.plan`, `.plan__body` и `.plan__aside`:
 * у медиазапроса нет своей специфичности, поэтому «столбик» и `justify-items:
 * center`, объявленные ниже по файлу, перебивали десктопную раскладку, и план
 * всегда оставался в столбик (проверено замером `flex-direction` в браузере).
 */
@media (min-width: 768px) {
  .plan {
    padding: var(--space-6);
  }

  .plan__body {
    flex-direction: row;
    align-items: center;
    gap: var(--space-7);
    text-align: left;
  }

  .plan__aside {
    justify-items: start;
  }
}

/* ── Виджеты ────────────────────────────────────────────────────────── */
.widgets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
}

.widget {
  gap: var(--space-1);
}

.widget__title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.widget__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.widget__value {
  margin-top: var(--space-2);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
}

.widget__caption {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.widget__link {
  margin-top: auto;
  padding-top: var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--c-amber);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

.card--mint .widget__link {
  color: var(--c-brand);
}

/* ── Привычки ───────────────────────────────────────────────────────── */
.habits {
  gap: var(--space-4);
}

.habits__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.habits__summary {
  flex: 1;
  min-width: 0;
}

.habits__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.habits__empty {
  margin: 0;
}

.habits__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--tap-min);
  color: var(--c-brand);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

/* ── Достижения ─────────────────────────────────────────────────────── */
.achievements {
  gap: var(--space-4);
}

.achievements__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.achievements__summary {
  flex: 1;
  min-width: 0;
}

.achievements__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.achievement {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.achievement__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.achievement__body small {
  color: var(--c-text-muted);
}

.achievement__progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
  font-size: var(--fs-caption);
  color: var(--c-text-muted);
}

.achievement__progress :deep(.progress) {
  flex: 1;
}

.chip-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border-radius: var(--r-pill);
  background: var(--c-bg);
  color: var(--c-text);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

/* ── Совет дня ──────────────────────────────────────────────────────── */
.tip {
  gap: var(--space-3);
  padding: 0;
  overflow: hidden;
  color: var(--c-text);
  text-decoration: none;
}

.tip__more {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--c-accent);
  font-size: var(--fs-caption);
  font-weight: 600;
}

.tip__image {
  width: 100%;
  height: 160px;
  object-fit: cover;
  background: var(--c-surface-sunken);
}

.tip__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: 0 var(--space-4) var(--space-4);
}

/* ── Состояния ──────────────────────────────────────────────────────── */
.state {
  color: var(--c-text-muted);
}

.state--error {
  color: var(--c-danger);
}

/* ── Десктопные детали ──────────────────────────────────────────────────
 * На широком экране столбик из виджетов выглядел сиротливо: собираем в две
 * колонки и даём картинке совета больше места.
 */
@media (min-width: 768px) {
  .widgets {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-5);
  }

  .tip__image {
    height: 220px;
  }
}

/* ── Привычки и достижения рядом ────────────────────────────────────────
 * Две карточки одинаковой природы: короткие списки с прогрессом. В две колонки
 * они читаются лучше и не заставляют листать главную.
 */
@media (min-width: 1024px) {
  .home__pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-5);
    align-items: start;
  }

  /* Гость: привычек нет, значит достижения занимают всю ширину */
  .home__pair:has(> :only-child) {
    grid-template-columns: 1fr;
  }
}
</style>
