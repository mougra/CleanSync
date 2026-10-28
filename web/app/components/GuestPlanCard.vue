<script setup lang="ts">
/**
 * План на сегодня для гостя.
 *
 * Тот же базовый набор, что получит зарегистрированный (`services/taskSets.ts`),
 * показывает публичный маршрут `/api/plan/today`. Смысл: человек видит реальный
 * список дел до регистрации, а не обещание «соберём план». Отметок у гостя нет —
 * прогресс хранится в аккаунте, и приписка говорит об этом прямо.
 */
import type { TaskLevel } from '~/types/catalog';

const props = defineProps<{ date: string }>();

const { t } = useI18n();
const localePath = useLocalePath();
const api = useApi();

interface GuestTask {
  title: string;
  room: string;
  minutes: number;
  level: TaskLevel;
  cadence: string;
}

interface GuestDay {
  date: string;
  tasks: GuestTask[];
  summary: { tasks: number; minutes: number };
}

const { data, error } = await useAsyncData(
  () => `guest-plan-${props.date}`,
  () => api.request<GuestDay>(`/api/plan/today?date=${props.date}`),
  { watch: [() => props.date], default: () => null },
);

const tasks = computed<GuestTask[]>(() => data.value?.tasks ?? []);
const minutes = computed(() => formatDuration(data.value?.summary.minutes ?? 0));
</script>

<template>
  <section v-if="tasks.length" class="guest">
    <header class="guest__head">
      <h2 class="guest__title">{{ t('plan.guestPlanTitle') }}</h2>
      <p class="guest__meta">
        {{ t('plan.guestPlanSummary', { count: tasks.length, minutes }) }}
      </p>
    </header>

    <ul class="guest__list">
      <li v-for="task in tasks" :key="`${task.title}-${task.minutes}`" class="guest__item">
        <span class="guest__name">{{ task.title }}</span>
        <span class="guest__minutes">{{ t('plan.minutes', { minutes: task.minutes }) }}</span>
      </li>
    </ul>

    <p class="guest__note">{{ t('plan.guestPlanNote') }}</p>

    <div class="guest__actions">
      <AppButton variant="filled" block :to="localePath('/register')">
        {{ t('plan.guestPlanCta') }}
      </AppButton>
      <AppButton variant="outline" block :to="localePath('/login')">
        {{ t('plan.guestPlanLogin') }}
      </AppButton>
    </div>
  </section>

  <p v-else-if="error" class="guest__error">{{ t('state.error') }}</p>
</template>

<style scoped>
.guest {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.guest__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.guest__title {
  font-size: var(--fs-title);
}

.guest__meta,
.guest__note {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.guest__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.guest__item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--c-border);
}

.guest__item:last-child {
  border-bottom: none;
}

.guest__name {
  min-width: 0;
  font-size: var(--fs-body);
}

.guest__minutes {
  flex: 0 0 auto;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.guest__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.guest__error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}
</style>
