<script setup lang="ts">
/**
 * Экран достижений: все награды с прогрессом, сгруппированные по смыслу.
 * Гостю показываем справочник без прогресса — что вообще можно получить.
 */
import type { Achievement, AchievementProgress } from '~/types/achievement';

const { t } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();

const { catalog, progress, earned, total } = await useAchievements();

const percent = computed(() =>
  total.value === 0 ? 0 : Math.round((earned.value / total.value) * 100),
);

const groupOf = (criteriaType: string) => {
  if (criteriaType === 'total_completed') {
    return 'tasks';
  }
  return criteriaType.startsWith('challenge') ? 'challenges' : 'habits';
};

/** Гости видят справочник: прогресса нет, но названия и условия полезны. */
const items = computed<Array<Achievement | AchievementProgress>>(() =>
  auth.isAuthenticated ? progress.value : catalog.value,
);

const groups = computed(() =>
  (['tasks', 'challenges', 'habits'] as const)
    .map((key) => ({
      key,
      label: t(`achievements.group${key.charAt(0).toUpperCase()}${key.slice(1)}`),
      items: items.value.filter((item) => groupOf(item.criteria_type) === key),
    }))
    .filter((group) => group.items.length > 0),
);

const currentOf = (item: Achievement | AchievementProgress) =>
  'current' in item ? (item as AchievementProgress).current : 0;

const isEarned = (item: Achievement | AchievementProgress) =>
  'earned' in item ? (item as AchievementProgress).earned : false;

const earnedLabel = (item: Achievement | AchievementProgress) => {
  const at = (item as AchievementProgress).earned_at;

  return at
    ? t('achievements.earnedOn', {
        date: new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(
          new Date(at),
        ),
      })
    : null;
};

useSeoMeta({
  title: () => t('achievements.title'),
  description: () =>
    'Достижения за уборку: задачи, челленджи и привычки. Смотрите, что уже открыто и сколько осталось до следующей награды.',
});
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('achievements.title') }}</h1>

    <section v-if="auth.isAuthenticated" class="card">
      <p class="card__count">
        <strong>{{ earned }}</strong>
        <span>{{ t('achievements.progress', { earned, total }) }}</span>
      </p>
      <ProgressBar :value="percent" />
    </section>

    <p v-else class="hint">{{ t('achievements.signIn') }}</p>

    <section v-for="group in groups" :key="group.key" class="group">
      <h2 class="group__title">{{ group.label }}</h2>

      <ul class="list">
        <li
          v-for="item in group.items"
          :key="item.code"
          class="achievement"
          :class="{ 'achievement--earned': isEarned(item) }"
        >
          <span class="achievement__icon" aria-hidden="true">
            <i :class="['pi', isEarned(item) ? item.icon : 'pi-lock']" />
          </span>

          <div class="achievement__body">
            <strong class="achievement__name">{{ item.name }}</strong>
            <small class="achievement__text">{{ item.description }}</small>

            <div v-if="auth.isAuthenticated" class="achievement__progress">
              <ProgressBar thin :value="Math.round((currentOf(item) / item.criteria_value) * 100)" />
              <span>{{ currentOf(item) }}/{{ item.criteria_value }}</span>
            </div>

            <small v-if="earnedLabel(item)" class="achievement__date">{{ earnedLabel(item) }}</small>
          </div>
        </li>
      </ul>
    </section>

    <AppButton v-if="!auth.isAuthenticated" variant="filled" block :to="localePath('/login')">
      {{ t('auth.login') }}
    </AppButton>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.page__title {
  font-size: var(--fs-display);
}

.hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
}

.card__count {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.card__count strong {
  font-size: 2rem;
  line-height: 1;
}

.card__count span {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.group__title {
  font-size: var(--fs-caption);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-text-muted);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
}

.achievement {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
  opacity: 0.72;
  transition:
    transform var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out),
    opacity var(--dur-base) var(--ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .achievement:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-soft);
    opacity: 1;
  }
}

@media (min-width: 768px) {
  /* Десктоп: достижения в две колонки внутри каждой группы */
  .list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .achievement,
  .achievement:hover {
    transform: none;
    transition: none;
  }
}

.achievement--earned {
  opacity: 1;
  background: var(--c-surface-mint);
}

.achievement__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: var(--r-chip);
  background: var(--c-surface-sunken);
  color: var(--c-text-muted);
}

.achievement--earned .achievement__icon {
  background: var(--c-surface);
  color: var(--c-brand);
}

.achievement__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.achievement__name {
  font-weight: 600;
}

.achievement__text,
.achievement__date {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.achievement__progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.achievement__progress :deep(.progress) {
  flex: 1;
}
</style>
