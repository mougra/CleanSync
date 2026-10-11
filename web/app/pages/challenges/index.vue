<script setup lang="ts">
/**
 * Список челленджей: челлендж текущего сезона (его и проходят) плюс программы
 * других сезонов — их можно посмотреть заранее, отметки начнутся в свой сезон.
 */
const { t } = useI18n();
const localePath = useLocalePath();
const { list, active, current, seasonChallenge, available } = await useChallenges();

/** Челлендж сезона закрыт: до следующего сезона показываем только пояснение. */
const completed = computed(() => current.value.status === 'completed');

/** Сезонный челлендж не дублируем, если он уже показан как «в процессе». */
const seasonCard = computed(() =>
  seasonChallenge.value && seasonChallenge.value.slug !== active.value?.challenge.slug
    ? seasonChallenge.value
    : null,
);

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

    <template v-if="seasonCard">
      <h2 class="section-title">{{ t('challengesPage.season') }}</h2>
      <ChallengeCard
        :title="seasonCard.title"
        :description="seasonCard.description"
        :badge-label="`${seasonCard.days_count} ${t('challengesPage.days')} · ${seasonCard.tasks_count} ${t('challengesPage.tasks')}`"
        :cover-url="seasonCard.cover_url"
        :to="localePath(`/challenges/${seasonCard.slug}`)"
      />
    </template>

    <p v-if="completed" class="state">{{ t('challengesPage.seasonCompleted') }}</p>

    <h2 class="section-title">{{ t('challengesPage.otherSeasons') }}</h2>

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
