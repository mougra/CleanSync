<script setup lang="ts">
/**
 * Экран челленджа по макетам docs/design/mockups/02..08:
 * карточка прогресса, дни с задачами, отметки и завершение.
 *
 * Гостю задачи видны, но отметки недоступны — для них нужна сессия
 * (httpOnly-cookie), поэтому показывается приглашение войти.
 */

import type { ChallengeDetail, ChallengeTask } from '~/types/challenge';

const { t, locale } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const auth = useAuthStore();
const api = useApi();

const slug = String(route.params.slug);

const { data: detail, error } = await useAsyncData(`challenge-${slug}`, () =>
  api.request<ChallengeDetail>(`/api/challenges/${slug}`),
);

const { active, refreshActive } = await useChallenges();
const { show: showAchievements } = useAchievementToast();

const isActive = computed(() => active.value?.challenge.slug === slug);

/** Когда челлендж активен, показываем дни с отметками пользователя. */
const days = computed(() => (isActive.value ? (active.value?.days ?? []) : (detail.value?.days ?? [])));

const progress = computed(() =>
  isActive.value && active.value ? active.value.progress : (detail.value?.progress ?? null),
);

const title = computed(() => detail.value?.challenge.title ?? '');
const busy = ref(false);

/** Сумма времени по дню и метка частоты для строки задачи. */
const dayMinutes = (day: { tasks: ChallengeTask[] }) =>
  day.tasks.reduce((sum, task) => sum + task.estimated_minutes, 0);

const frequencyLabel = (task: ChallengeTask) =>
  task.frequency && task.frequency !== 'once' ? t(`challenge.frequency.${task.frequency}`) : null;

const toggleTask = async (task: ChallengeTask) => {
  if (!isActive.value || busy.value) {
    return;
  }

  busy.value = true;
  try {
    const response = await api.request<{ awarded?: string[] }>(`/api/challenges/tasks/${task.id}`, {
      method: 'PATCH',
      body: { isDone: !task.is_done },
    });

    await refreshActive();

    // Новая ачивка — показываем уведомление и обновляем прогресс достижений.
    if (response.awarded?.length) {
      await showAchievements(response.awarded);
      await refreshNuxtData('achievements-progress');
    }
  } finally {
    busy.value = false;
  }
};

const startChallenge = async () => {
  busy.value = true;
  try {
    await api.request(`/api/challenges/${slug}/start`, { method: 'POST' });
    clearNuxtData(['active-challenge', 'challenges']);
    await refreshActive();
  } finally {
    busy.value = false;
  }
};

const finishChallenge = async () => {
  busy.value = true;
  try {
    await api.request('/api/challenges/active/finish', { method: 'POST' });
    clearNuxtData(['active-challenge', 'challenges']);
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
      <NuxtLink :to="localePath('/challenges')" class="back">
        <i class="pi pi-arrow-left" aria-hidden="true" />
        {{ t('challenge.back') }}
      </NuxtLink>

      <img
        v-if="detail?.challenge.cover_url"
        class="hero"
        :src="detail.challenge.cover_url"
        :alt="title"
      >

      <section class="card progress-card">
        <span class="progress-card__icon" aria-hidden="true">⚑</span>
        <div class="progress-card__body">
          <strong>{{ title }}</strong>
          <small v-if="progress">{{ progress.done }}/{{ progress.total }} · {{ progress.percent }}%</small>
          <ProgressBar :value="progress?.percent ?? 0" />
        </div>
      </section>

      <p v-if="!auth.isAuthenticated" class="notice">
        {{ t('challenge.signInToTrack') }}
        <NuxtLink :to="localePath('/login')">{{ t('auth.login') }}</NuxtLink>
      </p>

      <p
        v-else-if="progress && progress.total > 0 && progress.done === progress.total"
        class="notice notice--done"
      >
        {{ t('challenge.allDone') }}
      </p>

      <section v-for="day in days" :key="day.id" class="day">
        <h2 class="day__title">
          {{ t('challenge.day') }} {{ day.day_number }} — {{ day.title }}
        </h2>
        <p v-if="day.subtitle" class="day__subtitle">{{ day.subtitle }}</p>
        <p class="day__total">
          {{ t('challenge.totalTime', { time: formatMinutes(dayMinutes(day), locale) }) }}
        </p>

        <ul class="tasks">
          <li v-for="task in day.tasks" :key="task.id">
            <TaskRow
              :title="task.title"
              :hint="task.hint"
              :badge="frequencyLabel(task)"
              :done="task.is_done"
              :interactive="isActive"
              :disabled="busy"
              @toggle="toggleTask(task)"
            />
          </li>
        </ul>
      </section>

      <div class="actions">
        <AppButton
          v-if="auth.isAuthenticated && !isActive"
          variant="filled"
          block
          :disabled="busy"
          @click="startChallenge"
        >
          {{ t('challenge.start') }}
        </AppButton>

        <AppButton
          v-else-if="isActive"
          variant="outline"
          block
          :disabled="busy"
          @click="finishChallenge"
        >
          {{ t('challenge.finish') }}
        </AppButton>

        <AppButton v-else variant="filled" block :to="localePath('/login')">
          {{ t('auth.login') }}
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

.hero {
  width: 100%;
  height: 180px;
  object-fit: cover;
  border-radius: var(--r-card);
  background: var(--c-surface-sunken);
}

.progress-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
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

.day__total {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.tasks {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.state {
  color: var(--c-text-muted);
}

.state--error {
  color: var(--c-danger);
}
</style>
