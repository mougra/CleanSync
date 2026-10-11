<script setup lang="ts">
/**
 * Экран челленджа по макетам «осенний челлендж 1–6»:
 * стрелка назад и название, карточка прогресса с флажком, дни с задачами,
 * снизу закреплённая пара кнопок «Завершить испытание» и «Закрыть испытание».
 *
 * Кнопки «Начать» здесь нет: отметка ставится в один тап, а запись пользователя
 * сервер создаёт сам при первой отметке (`PATCH /api/challenges/tasks/:taskId`).
 *
 * Челлендж открыт всем. Гость отмечает задачи так же, в один тап, но отметки
 * живут в localStorage браузера (структура — в `utils/guestChallenge.ts`), а
 * «Завершить испытание» помечает челлендж пройденным локально. При входе или
 * регистрации накопленное переносится в аккаунт — см. плагин `guest-challenge`.
 */

import type { ChallengeDay, ChallengeDetail, ChallengeTask } from '~/types/challenge';

const { t, locale } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const auth = useAuthStore();
const api = useApi();

const slug = String(route.params.slug);

const { data: detail, error } = await useAsyncData(`challenge-${slug}`, () =>
  api.request<ChallengeDetail>(`/api/challenges/${slug}`),
);

/**
 * Несуществующий челлендж должен отдавать 404, а не пустую страницу с кодом
 * 200: поисковики считают такие адреса «мягкими 404» и тратят на них краулинг.
 */
if (error.value || !detail.value) {
  throw createError({ statusCode: 404, statusMessage: t('challengesPage.empty'), fatal: true });
}

const {
  active,
  current,
  seasonGuestProgress,
  toggleTask: toggleChallengeTask,
  finish,
} = await useChallenges();
const { show: showAchievements } = useAchievementToast();
const guest = useGuestChallenge();

/** Челлендж с открытой записью пользователя — независимо от сезона. */
const running = computed(() => (active.value?.challenge.slug === slug ? active.value : null));

/** Состояние сезонного челленджа, если открыт именно он. */
const seasonState = computed(() => {
  const state = current.value;

  return 'challenge' in state && state.challenge?.slug === slug ? state : null;
});

/**
 * Закрытый челлендж: на главной его нет, отметки в нём больше не ставим.
 * Слаг берём из `challengeSlug`, а если поле не пришло — из карточки челленджа.
 */
const completedState = computed(() => {
  const state = current.value;

  if (state.status !== 'completed') {
    return null;
  }

  const completedSlug = state.challengeSlug ?? state.challenge?.slug ?? null;

  return completedSlug === slug ? state : null;
});

const completed = computed(() => completedState.value !== null);

/** Когда пользователь закрыл челлендж — по макету показываем дату завершения. */
const finishedAt = computed(() => completedState.value?.finishedAt ?? null);

const seasonDays = computed<ChallengeDay[]>(() => {
  const state = current.value;

  return 'days' in state ? (state.days ?? []) : [];
});

const seasonProgress = computed(() => {
  const state = current.value;

  return 'progress' in state ? (state.progress ?? null) : null;
});

/**
 * Дни с отметками берём оттуда, где они есть:
 * начатый челлендж → сезонный → закрытый (API их пока не отдаёт) → публичные
 * дни, поверх которых у гостя лежат его локальные отметки.
 */
const days = computed<ChallengeDay[]>(() => {
  if (running.value) {
    return running.value.days;
  }

  if (seasonState.value || completed.value) {
    return seasonDays.value;
  }

  // Гость: публичные дни плюс то, что он отметил в этом браузере.
  return auth.isAuthenticated
    ? (detail.value?.days ?? [])
    : guest.withGuestMarks(slug, detail.value?.days ?? []);
});

const progress = computed(() => {
  if (running.value) {
    return running.value.progress;
  }

  // Гость: прогресс и отметки считаются по одной и той же паре «дни + локальные
  // отметки», иначе полоса расходилась бы с галочками.
  if (!auth.isAuthenticated) {
    return seasonGuestProgress.value;
  }

  if (seasonState.value || completed.value) {
    return seasonProgress.value;
  }

  return detail.value?.progress ?? null;
});

/** Гость завершил испытание в этом браузере — серверу об этом знать нечего. */
const guestCompleted = computed(() => !auth.isAuthenticated && guest.isLocallyCompleted(slug));

/**
 * Отметка доступна там, где её примет сервер (свой челлендж), а гостю — на любом
 * челлендже текущего сезона: его отметки живут в localStorage и сети не требуют.
 */
const tickable = computed(
  () =>
    !completed.value &&
    !guestCompleted.value &&
    (auth.isAuthenticated
      ? Boolean(running.value || seasonState.value)
      : Boolean(detail.value?.days?.length)),
);

const title = computed(() => detail.value?.challenge.title ?? '');

const busy = ref<number | null>(null);
const failed = ref(false);
const finishing = ref(false);
const finishFailed = ref(false);

/** Сумма времени по дню и метка частоты для строки задачи. */
const dayMinutes = (day: { tasks: ChallengeTask[] }) =>
  day.tasks.reduce((sum, task) => sum + task.estimated_minutes, 0);

const frequencyLabel = (task: ChallengeTask) =>
  task.frequency && task.frequency !== 'once' ? t(`challenge.frequency.${task.frequency}`) : null;

/**
 * Одна отметка в один тап: галочка и прогресс меняются сразу (оптимистично),
 * при ошибке состояние откатывается, а строка сообщает о сбое.
 */
const onToggle = async (task: ChallengeTask) => {
  if (!tickable.value || busy.value !== null) {
    return;
  }

  busy.value = task.id;
  failed.value = false;

  try {
    const { awarded } = await toggleChallengeTask(task);

    // Новая ачивка — показываем уведомление и обновляем прогресс достижений.
    if (awarded.length) {
      await showAchievements(awarded);
      await refreshNuxtData('achievements-progress');
    }
  } catch {
    failed.value = true;
  } finally {
    busy.value = null;
  }
};

/**
 * «Завершить испытание» — челлендж отмечается пройденным и уходит с главной.
 * Гостю сервер для этого не нужен: `finish` помечает челлендж пройденным
 * в localStorage, и главная читает ту же отметку.
 */
const completeChallenge = async () => {
  if (finishing.value) {
    return;
  }

  finishing.value = true;
  finishFailed.value = false;

  try {
    await finish(slug);
    await navigateTo(localePath('/'));
  } catch {
    // Серверу нечего завершать (например, отметок ещё нет) или сеть подвела.
    finishFailed.value = true;
  } finally {
    finishing.value = false;
  }
};

/** «Закрыть испытание» — просто вернуться на главную, отметки уже сохранены. */
const closeChallenge = async () => {
  await navigateTo(localePath('/'));
};

/** Дата завершения — в формате языка интерфейса, как на странице советов. */
const finishedLabel = computed(() =>
  finishedAt.value
    ? new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long', year: 'numeric' }).format(
        new Date(finishedAt.value),
      )
    : '',
);

useSeoMeta({
  title: () => title.value,
  description: () => detail.value?.challenge.description ?? undefined,
  ogType: 'article',
  ogImage: () => detail.value?.challenge.cover_url ?? undefined,
});

const site = useSiteConfig();

/** Суммарное время челленджа — в формате ISO 8601, как ждёт HowTo. */
const totalMinutes = computed(() =>
  days.value.reduce(
    (sum, day) => sum + day.tasks.reduce((inner, task) => inner + (task.estimated_minutes ?? 0), 0),
    0,
  ),
);

/**
 * Челлендж — это готовая инструкция по дням, поэтому размечаем его как HowTo:
 * шаг = день, текст шага = задачи этого дня.
 */
useStructuredData(() => {
  const page = detail.value;

  if (!page) {
    return null;
  }

  const url = `${site.url}/challenges/${slug}`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'HowTo',
        '@id': `${url}#howto`,
        name: page.challenge.title,
        description: page.challenge.description ?? '',
        image: page.challenge.cover_url ?? undefined,
        totalTime: totalMinutes.value > 0 ? `PT${totalMinutes.value}M` : undefined,
        inLanguage: 'ru-RU',
        step: days.value.map((day) => ({
          '@type': 'HowToStep',
          name: String(day.title ?? ''),
          text: day.tasks.map((task) => task.title).join(', '),
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('nav.today'), item: `${site.url}/` },
          { '@type': 'ListItem', position: 2, name: t('challengesPage.title'), item: `${site.url}/challenges` },
          { '@type': 'ListItem', position: 3, name: page.challenge.title, item: url },
        ],
      },
    ],
  };
});
</script>

<template>
  <div class="challenge">
    <p v-if="error" class="state state--error">
      {{ t('state.error') }}<br >
      <small>{{ t('state.errorHint') }}</small>
    </p>

    <template v-else>
      <!-- Шапка макета: стрелка назад и название челленджа -->
      <header class="head">
        <NuxtLink :to="localePath('/challenges')" class="head__back" :aria-label="t('challenge.back')">
          <i class="pi pi-arrow-left" aria-hidden="true" />
        </NuxtLink>
        <h1 class="head__title">{{ title }}</h1>
      </header>

      <!-- Карточка прогресса: флажок в светлом круге, название, полоса и счётчик -->
      <section class="progress-card">
        <span class="progress-card__icon" aria-hidden="true">⚑</span>
        <div class="progress-card__body">
          <strong>{{ title }}</strong>
          <small v-if="progress">
            {{ progress.done }}/{{ progress.total }} · {{ progress.percent }}%
          </small>
          <ProgressBar thin :value="progress?.percent ?? 0" />
        </div>
      </section>

      <!--
        Гость отмечает задачи без аккаунта: прогресс лежит в этом браузере.
        Плашка объясняет это сразу, а не после неожиданной потери данных,
        и рядом стоит кнопка регистрации — прогресс перейдёт в аккаунт.
      -->
      <p v-if="!auth.isAuthenticated && !completed && !guestCompleted" class="notice">
        {{ t('challenge.guestHint') }}
        <NuxtLink :to="localePath('/register')" class="notice__link">
          {{ t('challenge.registerCta') }}
        </NuxtLink>
      </p>

      <p v-if="completed || guestCompleted" class="notice notice--done">
        {{ t('challenge.finished') }}<template v-if="finishedLabel"> · {{ finishedLabel }}</template>
      </p>

      <!-- У гостя завершение живёт только в браузере: говорим об этом прямо -->
      <p v-if="guestCompleted" class="notice">
        {{ t('challenge.storageNotice') }}
      </p>

      <p
        v-if="!completed && !guestCompleted && progress && progress.total > 0 && progress.done === progress.total"
        class="notice notice--done"
      >
        {{ t('challenge.allDone') }}
      </p>

      <p v-if="auth.isAuthenticated && !tickable && !completed" class="notice">
        {{ t('challenge.otherSeason') }}
      </p>

      <p v-if="failed" class="notice notice--error">{{ t('challenge.tickFailed') }}</p>

      <section v-for="day in days" :key="day.id" class="day">
        <p class="day__meta">
          {{ t('challenge.day') }} {{ day.day_number }} ·
          {{ t('challenge.dayTime', { time: formatMinutes(dayMinutes(day), locale) }) }}
        </p>
        <h2 class="day__title">{{ day.title }}</h2>
        <p v-if="day.subtitle" class="day__subtitle">{{ day.subtitle }}</p>

        <ul class="tasks">
          <li v-for="task in day.tasks" :key="task.id">
            <TaskRow
              :title="task.title"
              :hint="task.hint"
              :badge="frequencyLabel(task)"
              :done="task.is_done"
              :interactive="tickable"
              :disabled="busy !== null"
              tone="surface"
              clamp-hint
              @toggle="onToggle(task)"
            />
          </li>
        </ul>
      </section>

      <!-- Панель завершения закреплена снизу, как в макетах -->
      <p v-if="finishFailed" class="notice notice--error">{{ t('challenge.finishFailed') }}</p>

      <div class="actions">
        <template v-if="tickable">
          <!--
            Главная кнопка завершает испытание: заказчик описывал это как
            «завершить — тогда отмечается completed и больше не появляется на
            главной». Вторая, контурная, просто возвращает на главную: прогресс
            уже сохранён, закрывать челлендж при этом не нужно.
          -->
          <AppButton variant="filled" block :disabled="finishing" @click="completeChallenge">
            {{ t('challenge.finishTrial') }}
          </AppButton>
          <AppButton variant="outline" block :disabled="finishing" @click="closeChallenge">
            {{ t('challenge.closeTrial') }}
          </AppButton>
        </template>

        <AppButton v-else-if="auth.isAuthenticated" variant="filled" block :to="localePath('/')">
          {{ t('auth.toHome') }}
        </AppButton>

        <!--
          Гость завершил испытание: предлагаем аккаунт — при входе или
          регистрации локальные отметки переносятся, и челлендж останется
          пройденным уже на сервере.
        -->
        <template v-else-if="guestCompleted">
          <AppButton variant="filled" block :to="localePath('/register')">
            {{ t('challenge.registerCta') }}
          </AppButton>
          <AppButton variant="outline" block :to="localePath('/')">
            {{ t('auth.toHome') }}
          </AppButton>
        </template>

        <AppButton v-else variant="filled" block :to="localePath('/')">
          {{ t('auth.toHome') }}
        </AppButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.challenge {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-bottom: var(--space-4);
}

/* ── Шапка ──────────────────────────────────────────────────────────── */
.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.head__back {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  flex: 0 0 var(--tap-min);
  margin-left: calc(var(--space-2) * -1);
  color: var(--c-text);
  font-size: 1.25rem;
  text-decoration: none;
}

.head__back:hover {
  color: var(--c-brand);
}

.head__title {
  font-size: var(--fs-display);
  line-height: var(--lh-tight);
}

/* ── Карточка прогресса ─────────────────────────────────────────────── */
.progress-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.progress-card__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border-radius: var(--r-pill);
  background: var(--c-surface-mint);
  color: var(--c-brand);
  font-size: 1.25rem;
}

.progress-card__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.progress-card__body strong {
  font-size: var(--fs-title);
}

.progress-card__body small {
  color: var(--c-text-muted);
}

/* ── Строки-пояснения ───────────────────────────────────────────────── */
.notice {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface-warm);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.notice--done {
  background: var(--c-surface-mint);
  color: var(--c-brand);
}

.notice--error {
  background: var(--c-surface-task);
  color: var(--c-danger);
}

/* Ссылка внутри поясняющей строки: та же плотность текста, но заметнее */
.notice__link {
  color: var(--c-brand);
  font-weight: 600;
  text-underline-offset: 3px;
}

/* ── День ───────────────────────────────────────────────────────────── */
.day {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.day__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.day__title {
  font-size: var(--fs-display);
  line-height: var(--lh-tight);
}

.day__subtitle {
  color: var(--c-text-muted);
}

.tasks {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ── Панель завершения ──────────────────────────────────────────────────
 * В макетах кнопки закреплены снизу и контент прокручивается за ними.
 * На мобильном поднимаем панель над нижней навигацией, на десктопе её нет.
 */
.actions {
  position: sticky;
  bottom: calc(76px + env(safe-area-inset-bottom));
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-2);
  padding-top: var(--space-3);
}

@media (min-width: 768px) {
  .actions {
    bottom: var(--space-4);
  }
}

/* ── Состояния ──────────────────────────────────────────────────────── */
.state {
  color: var(--c-text-muted);
}

.state--error {
  color: var(--c-danger);
}
</style>
