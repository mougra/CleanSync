<script setup lang="ts">
/**
 * Чек-листы и «свои задачи».
 *
 * Два раздела в одной вкладке: готовые шаблоны с прогрессом, если список уже
 * взят, и свои списки (расписания) — их пункты живут на странице списка.
 */
const { t, locale } = useI18n();
const localePath = useLocalePath();
const auth = useAuthStore();

const { templates, mine, own, addedByTemplate, addFromTemplate, createOwn } = await useChecklists();

const tab = ref<'checklists' | 'own'>('checklists');
const busy = ref<number | null>(null);
const newTitle = ref('');
const creating = ref(false);

/** Склонение «пункт / пункта / пунктов». */
const itemsLabel = (count: number) =>
  locale.value === 'ru'
    ? pluralRu(count, t('checklists.items_one'), t('checklists.items_few'), t('checklists.items_many'))
    : count === 1
      ? t('checklists.items_one')
      : t('checklists.items_many');

const add = async (templateId: number) => {
  if (!auth.isAuthenticated) {
    return navigateTo(localePath('/login'));
  }

  busy.value = templateId;
  try {
    const checklist = await addFromTemplate(templateId);
    await navigateTo(localePath(`/checklists/${checklist.id}`));
  } finally {
    busy.value = null;
  }
};

const create = async () => {
  if (!newTitle.value.trim() || creating.value) {
    return;
  }

  creating.value = true;
  try {
    const schedule = await createOwn(newTitle.value.trim());
    newTitle.value = '';
    await navigateTo(localePath(`/checklists/${schedule.id}`));
  } finally {
    creating.value = false;
  }
};

const percent = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 100));

useSeoMeta({
  title: () => t('nav.checklists'),
  description: () => t('checklistsPage.metaDescription'),
});
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('nav.checklists') }}</h1>

    <div class="segmented" role="group">
      <button
        type="button"
        class="segmented__item"
        :class="{ 'segmented__item--active': tab === 'checklists' }"
        :aria-pressed="tab === 'checklists'"
        @click="tab = 'checklists'"
      >
        {{ t('checklists.templates') }}
      </button>
      <button
        type="button"
        class="segmented__item"
        :class="{ 'segmented__item--active': tab === 'own' }"
        :aria-pressed="tab === 'own'"
        @click="tab = 'own'"
      >
        {{ t('checklists.own') }}
      </button>
    </div>

    <template v-if="tab === 'checklists'">
      <p class="hint">{{ t('checklists.templatesHint') }}</p>

      <ul class="list">
        <li v-for="template in templates" :key="template.id" class="card">
          <div class="card__body">
            <h2 class="card__title">{{ template.title }}</h2>
            <p class="card__meta">
              {{ template.items_count }} {{ itemsLabel(template.items_count) }}
            </p>
            <p v-if="template.description" class="card__text">{{ template.description }}</p>
          </div>

          <!-- Шаблон уже взят: показываем прогресс и ведём в список -->
          <template v-if="addedByTemplate.get(template.id)">
            <ProgressBar
              :value="
                percent(
                  addedByTemplate.get(template.id)!.done,
                  addedByTemplate.get(template.id)!.total,
                )
              "
            />
            <AppButton
              variant="outline"
              block
              :to="localePath(`/checklists/${addedByTemplate.get(template.id)!.id}`)"
            >
              {{ t('checklists.open') }} ·
              {{ addedByTemplate.get(template.id)!.done }}/{{ addedByTemplate.get(template.id)!.total }}
            </AppButton>
          </template>

          <AppButton
            v-else
            variant="filled"
            block
            :disabled="busy === template.id"
            @click="add(template.id)"
          >
            {{ t('checklists.add') }}
          </AppButton>
        </li>
      </ul>

      <template v-if="mine.length">
        <h2 class="section">{{ t('checklists.mine') }}</h2>
        <ul class="list">
          <li v-for="checklist in mine" :key="checklist.id">
            <NuxtLink :to="localePath(`/checklists/${checklist.id}`)" class="card card--link">
              <div class="card__body">
                <h3 class="card__title">{{ checklist.title }}</h3>
                <p class="card__meta">
                  {{ t('checklists.progress', { done: checklist.done, total: checklist.total }) }}
                </p>
              </div>
              <ProgressBar :value="percent(checklist.done, checklist.total)" />
            </NuxtLink>
          </li>
        </ul>
      </template>
    </template>

    <template v-else>
      <p class="hint">{{ t('checklists.ownHint') }}</p>

      <form class="create" @submit.prevent="create">
        <input
          v-model="newTitle"
          class="create__input"
          type="text"
          maxlength="120"
          :placeholder="t('checklists.newSchedulePlaceholder')"
          :aria-label="t('checklists.newSchedule')"
        >
        <AppButton variant="filled" type="submit" :disabled="!newTitle.trim() || creating">
          {{ t('checklists.create') }}
        </AppButton>
      </form>

      <p v-if="!own.length" class="hint">{{ t('checklists.empty') }}</p>

      <ul v-else class="list">
        <li v-for="schedule in own" :key="schedule.id">
          <NuxtLink :to="localePath(`/checklists/${schedule.id}`)" class="card card--link">
            <div class="card__body">
              <h3 class="card__title">{{ schedule.title }}</h3>
              <p class="card__meta">{{ t('checklists.kindSchedule') }}</p>
            </div>
            <i class="pi pi-chevron-right" aria-hidden="true" />
          </NuxtLink>
        </li>
      </ul>
    </template>
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
}

.segmented {
  display: flex;
  gap: var(--space-1);
  padding: 4px;
  border-radius: var(--r-pill);
  background: var(--c-surface-sunken);
}

.segmented__item {
  flex: 1;
  min-height: var(--tap-min);
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
}

.segmented__item--active {
  background: var(--c-surface);
  color: var(--c-brand);
  font-weight: 600;
}

.hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.section {
  margin-top: var(--space-3);
  font-size: 1.125rem;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
}

@media (min-width: 768px) {
  /* Десктоп: шаблоны чек-листов в сетке, а не одной длинной простынёй */
  .list {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
  }
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.card--link {
  flex-direction: row;
  align-items: center;
  color: var(--c-text);
  text-decoration: none;
}

.card--link:hover .card__title {
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
  font-size: var(--fs-body);
  font-weight: 600;
}

.card__meta,
.card__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.create {
  display: flex;
  gap: var(--space-2);
}

.create__input {
  flex: 1;
  min-width: 0;
  min-height: 52px;
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
}
</style>
