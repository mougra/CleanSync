<script setup lang="ts">
/** Список челленджей: активный и доступные к старту. */
const { t } = useI18n();
const localePath = useLocalePath();
const { list, active, available } = await useChallenges();

useSeoMeta({
  title: () => t('challengesPage.title'),
  description: () => t('challengesPage.metaDescription'),
});
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('challengesPage.title') }}</h1>

    <template v-if="active">
      <h2 class="section-title">{{ t('challengesPage.inProgress') }}</h2>
      <ChallengeCard
        :title="active.challenge.title"
        :badge-label="t('home.inProgress')"
        :progress="active.progress"
        :cover-url="active.challenge.cover_url"
        :to="localePath(`/challenges/${active.challenge.slug}`)"
      />
    </template>

    <h2 class="section-title">{{ t('challengesPage.available') }}</h2>

    <p v-if="!list.length" class="state">{{ t('challengesPage.empty') }}</p>

    <div v-else class="list">
      <ChallengeCard
        v-for="challenge in available"
        :key="challenge.slug"
        :title="challenge.title"
        :description="challenge.description"
        :badge-label="`${challenge.days_count} ${t('challengesPage.days')} · ${challenge.tasks_count} ${t('challengesPage.tasks')}`"
        :cover-url="challenge.cover_url"
        :to="localePath(`/challenges/${challenge.slug}`)"
      />
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.page__title {
  font-size: var(--fs-display);
  margin-bottom: var(--space-2);
}

.section-title {
  margin-top: var(--space-3);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-text-muted);
}

.list {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}

.state {
  color: var(--c-text-muted);
}

@media (min-width: 768px) {
  /* Десктоп: челленджи в две колонки, у каждого больше воздуха внутри */
  .list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-5);
  }
}

@media (min-width: 1024px) {
  /* Широкий экран: блоку хватает 550px, остальное оставляем воздуху */
  .list {
    grid-template-columns: 1fr;
    max-width: var(--content-narrow);
  }
}
</style>
