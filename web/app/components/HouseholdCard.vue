<script setup lang="ts">
/**
 * Компактный вход в дом на главной: видно, что общий план есть, сколько дел
 * закрыто сегодня и кто в доме активнее всех.
 */
const { t } = useI18n();
const localePath = useLocalePath();
const { household, members, zones, isOwner } = await useHousehold();

const todayTotal = computed(() => members.value.reduce((sum, member) => sum + member.today_done, 0));
const openTasks = computed(() => zones.value.reduce((sum, zone) => sum + (zone.total - zone.done), 0));
const leaders = computed(() =>
  [...members.value].sort((a, b) => b.week_done - a.week_done).slice(0, 3),
);

const displayName = (member: { username: string | null; email: string }) =>
  member.username || member.email.split('@')[0] || member.email;
</script>

<template>
  <NuxtLink v-if="household" :to="localePath('/household')" class="house-card">
    <div class="house-card__head">
      <div>
        <p class="house-card__label">{{ t('household.homeTitle') }}</p>
        <p class="house-card__name">{{ household.name }}</p>
      </div>
      <AppBadge :label="isOwner ? t('household.roleOwner') : t('household.roleMember')" />
    </div>

    <p class="house-card__stats">
      {{ t('household.memberToday') }}: <strong>{{ todayTotal }}</strong> ·
      {{ t('household.memberOpen') }}: <strong>{{ openTasks }}</strong>
    </p>

    <ul v-if="leaders.length > 1" class="house-card__people">
      <li v-for="member in leaders" :key="member.id">
        {{ displayName(member) }} — {{ member.week_done }}
      </li>
    </ul>

    <p class="house-card__hint">{{ t('household.homeHint') }}</p>
  </NuxtLink>
</template>

<style scoped>
.house-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-mint);
  color: var(--c-text);
  text-decoration: none;
}

.house-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.house-card__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.house-card__name {
  font-size: var(--fs-title);
  font-weight: 600;
}

.house-card__stats {
  font-size: var(--fs-caption);
  color: var(--c-text-muted);
}

.house-card__people {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--fs-caption);
}

.house-card__people li {
  padding: 2px var(--space-2);
  border-radius: 999px;
  background: var(--color-surface, var(--c-surface));
}

.house-card__hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}
</style>
