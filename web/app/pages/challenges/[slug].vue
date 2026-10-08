<script setup lang="ts">
/**
 * Экран челленджа по макетам docs/design/mockups/02..08:
 * карточка прогресса, дни с задачами, отметки и завершение.
 *
 * Гостю задачи видны, но отметки недоступны — для них нужна сессия
 * (httpOnly-cookie), поэтому показывается приглашение войти.
 */

interface ChallengeTask {
  id: number;
  title: string;
  hint: string | null;
  room: string | null;
  estimated_minutes: number;
  is_done: boolean;
}

interface ChallengeDay {
  id: number;
  day_number: number;
  title: string;
  subtitle?: string | null;
  tasks: ChallengeTask[];
}

interface ChallengeDetail {
  challenge: {
    id: number;
    slug: string;
    title: string;
    description: string | null;
    days_count: number;
    tasks_count: number;
  };
  progress: { done: number; total: number; percent: number; minutesLeft: number; currentDay: number | null };
  days: ChallengeDay[];
}

interface ActiveChallengeResponse {
  active: {
    challenge: { slug: string };
    progress: { done: number; total: number; percent: number; minutesLeft: number; currentDay: number | null };
    days: ChallengeDay[];
  } | null;
}

const { t } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const auth = useAuthStore();
const api = useApi();

const slug = String(route.params.slug);

const { data: detail, error } = await useAsyncData(`challenge-${slug}`, () =>
  api.request<ChallengeDetail>(`/api/challenges/${slug}`),
);

const { data: activeState, refresh: refreshActive } = await useAsyncData('active-challenge', () =>
  auth.isAuthenticated
    ? api.request<ActiveChallengeResponse>('/api/challenges/active')
    : Promise.resolve(null),
);

const isActive = computed(() => activeState.value?.active?.challenge.slug === slug);

/** Когда челлендж активен, берём дни с отметками пользователя. */
const days = computed<ChallengeDay[]>(() =>
  isActive.value ? (activeState.value?.active?.days ?? []) : (detail.value?.days ?? []),
);

const progress = computed(() =>
  isActive.value && activeState.value?.active
    ? activeState.value.active.progress
    : (detail.value?.progress ?? { done: 0, total: 0, percent: 0, minutesLeft: 0, currentDay: null }),
);

const title = computed(() => detail.value?.challenge.title ?? '');
const busy = ref(false);

const toggleTask = async (task: ChallengeTask) => {
  if (!isActive.value || busy.value) {
    return;
  }

  busy.value = true;
  try {
    await api.request(`/api/challenges/tasks/${task.id}`, {
      method: 'PATCH',
      body: { isDone: !task.is_done },
    });
    await refreshActive();
  } finally {
    busy.value = false;
  }
};

const startChallenge = async () => {
  busy.value = true;
  try {
    await api.request(`/api/challenges/${slug}/start`, { method: 'POST' });
    clearNuxtData(['active-challenge']);
    await refreshActive();
    await refreshNuxtData('today-plan');
  } finally {
    busy.value = false;
  }
};

const finishChallenge = async () => {
  busy.value = true;
  try {
    await api.request('/api/challenges/active/finish', { method: 'POST' });
    clearNuxtData(['active-challenge']);
    await refreshActive();
  } finally {
    busy.value = false;
  }
};

useSeoMeta({
  title: () => title.value,
  description: () => detail.value?.challenge.description ?? undefined,
});
</script>

<template>
  <div class="challenge">
    <p v-if="error" class="state state--error">
      {{ t('state.error') }}<br >
      <small>{{ t('state.errorHint') }}</small>
    </p>

    <template v-else>
      <NuxtLink :to="localePath('/')" class="back">
        <i class="pi pi-arrow-left" aria-hidden="true" />
        {{ t('challenge.back') }}
      </NuxtLink>

      <section class="card progress-card">
        <span class="progress-card__icon" aria-hidden="true">⚑</span>
        <div class="progress-card__body">
          <strong>{{ title }}</strong>
          <small>{{ progress.done }}/{{ progress.total }} · {{ progress.percent }}%</small>
          <div class="progress">
            <div class="progress__fill" :style="{ width: `${progress.percent}%` }" />
          </div>
        </div>
      </section>

      <p v-if="!auth.isAuthenticated" class="notice">
        {{ t('challenge.signInToTrack') }}
        <NuxtLink :to="localePath('/login')">{{ t('auth.login') }}</NuxtLink>
      </p>

      <p v-else-if="progress.total > 0 && progress.done === progress.total" class="notice notice--done">
        {{ t('challenge.allDone') }}
      </p>

      <section v-for="day in days" :key="day.id" class="day">
        <h2 class="day__title">
          {{ t('challenge.day') }} {{ day.day_number }} — {{ day.title }}
        </h2>
        <p v-if="day.subtitle" class="day__subtitle">{{ day.subtitle }}</p>

        <ul class="tasks">
          <li v-for="task in day.tasks" :key="task.id">
            <button
              type="button"
              class="task"
              :class="{ 'task--done': task.is_done, 'task--static': !isActive }"
              :aria-pressed="task.is_done"
              :disabled="!isActive || busy"
              @click="toggleTask(task)"
            >
              <span class="task__check" aria-hidden="true">
                <i v-if="task.is_done" class="pi pi-check" />
              </span>
              <span class="task__text">
                {{ task.title }}
                <small v-if="task.hint">{{ task.hint }}</small>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <div class="actions">
        <button
          v-if="auth.isAuthenticated && !isActive"
          type="button"
          class="btn btn--filled"
          :disabled="busy"
          @click="startChallenge"
        >
          {{ t('challenge.start') }}
        </button>

        <button
          v-else-if="isActive"
          type="button"
          class="btn btn--outline"
          :disabled="busy"
          @click="finishChallenge"
        >
          {{ t('challenge.finish') }}
        </button>

        <NuxtLink v-else :to="localePath('/login')" class="btn btn--filled">
          {{ t('auth.login') }}
        </NuxtLink>
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

.back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  min-height: var(--tap-min);
  color: var(--c-text);
  text-decoration: none;
}

.back:hover {
  color: var(--c-brand);
}

.progress-card {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.progress-card__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: var(--r-pill);
  background: var(--c-surface-mint);
  color: var(--c-brand);
}

.progress-card__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.progress-card__body small {
  color: var(--c-text-muted);
}

.progress {
  height: 8px;
  border-radius: var(--r-pill);
  background: var(--c-track);
  overflow: hidden;
}

.progress__fill {
  width: 0%;
  height: 100%;
  border-radius: var(--r-pill);
  background: var(--c-brand);
  transition: width 0.25s ease;
}

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

.day {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
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

.task {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 64px;
  padding: var(--space-3) var(--space-4);
  border: none;
  border-radius: var(--r-row);
  background: var(--c-surface-task);
  color: var(--c-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.task--static {
  cursor: default;
}

.task--done {
  opacity: 0.6;
  text-decoration: line-through;
}

.task__check {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border: 1.5px solid var(--c-brand);
  border-radius: var(--r-pill);
  color: var(--c-brand);
  font-size: 0.75rem;
}

.task__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task__text small {
  color: var(--c-text-muted);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 0 var(--space-5);
  border-radius: var(--r-pill);
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn--filled {
  border: none;
  background: var(--c-brand);
  color: var(--c-onbrand);
}

.btn--outline {
  border: 1.5px solid var(--c-brand);
  background: transparent;
  color: var(--c-brand);
}

.state {
  color: var(--c-text-muted);
}

.state--error {
  color: var(--c-danger);
}
</style>
