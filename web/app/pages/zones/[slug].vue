<script setup lang="ts">
/**
 * Страница зоны: все дела каталога для одной комнаты, разложенные по
 * периодичности.
 *
 * Адрес и содержимое собираются из каталога задач (`backend/routes/catalog.ts`),
 * поэтому страница не расходится с тем, что приложение реально ставит в план:
 * добавили дело в каталог — оно появилось здесь.
 *
 * Группы идут от частого к редкому: человек, который ищет «что делать на кухне
 * каждую неделю», получает ответ первым блоком, а обслуживание читает ниже.
 */
import type { ZonePage, ZonesResponse } from '~/types/catalog';

const { t, locale } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const { request } = useApi();

const slug = computed(() => String(route.params.slug ?? ''));

const { data } = await useAsyncData(
  () => `zone-${slug.value}`,
  async () => {
    const [zone, zones] = await Promise.all([
      request<ZonePage>(`/api/catalog/zones/${slug.value}`).catch(() => null),
      request<ZonesResponse>('/api/catalog/zones').catch(() => ({ zones: [] })),
    ]);

    return { zone, zones: zones.zones };
  },
  { watch: [slug] },
);

if (!data.value?.zone) {
  throw createError({ statusCode: 404, statusMessage: t('zonesPage.notFound'), fatal: true });
}

const zone = computed(() => data.value?.zone ?? null);

/** Название зоны — из словаря интерфейса: язык страницы и заголовка совпадают. */
const zoneName = computed(() =>
  slug.value ? t(`tasks.zone.${slug.value}`, zone.value?.title ?? '') : '',
);

const title = computed(() => t('zonesPage.zoneTitle', { zone: zoneName.value }));
const description = computed(() =>
  t('zonesPage.zoneLead', {
    tasks: zone.value?.tasks ?? 0,
    minutes: formatDuration(zone.value?.minutes ?? 0, locale.value),
    zone: zoneName.value,
  }),
);

const otherZones = computed(() =>
  (data.value?.zones ?? []).filter((item) => item.slug !== slug.value),
);

const levelLabel = (level: 'light' | 'normal' | 'deep') =>
  t(
    level === 'light'
      ? 'zonesPage.levelLight'
      : level === 'deep'
        ? 'zonesPage.levelDeep'
        : 'zonesPage.levelNormal',
  );

const site = useSiteConfig();

useCanonical();

useSeoMeta({
  title: () => title.value,
  description: () => description.value,
  ogTitle: () => title.value,
  ogDescription: () => description.value,
});

useStructuredData(() => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('nav.today'), item: `${site.url}/` },
        {
          '@type': 'ListItem',
          position: 2,
          name: t('zonesPage.title'),
          item: `${site.url}${localePath('/zones')}`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: zoneName.value,
          item: `${site.url}${localePath(`/zones/${slug.value}`)}`,
        },
      ],
    },
    {
      '@type': 'ItemList',
      name: title.value,
      description: description.value,
      numberOfItems: zone.value?.tasks ?? 0,
      itemListElement: (zone.value?.groups ?? []).flatMap((group) =>
        group.tasks.map((task, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: task.title,
          description: `${group.title} · ${formatMinutes(task.minutes, locale.value)}`,
        })),
      ),
    },
  ],
}));
</script>

<template>
  <article v-if="zone" class="zone">
    <NuxtLink :to="localePath('/zones')" class="zone__back">
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('zonesPage.allZones') }}
    </NuxtLink>

    <h1 class="zone__title">{{ title }}</h1>
    <p class="zone__lead">{{ description }}</p>

    <section v-for="group in zone.groups" :key="group.cadence" class="zone__group">
      <header class="zone__group-head">
        <h2 class="zone__group-title">{{ group.title }}</h2>
        <span class="zone__group-meta">
          {{ group.tasks.length }} {{ t('zonesPage.tasksCount') }} ·
          {{ formatDuration(group.minutes, locale) }}
        </span>
      </header>

      <ul class="zone__tasks">
        <li v-for="task in group.tasks" :key="task.title" class="zone__task">
          <span class="zone__task-title">{{ task.title }}</span>
          <span class="zone__task-meta">
            {{ formatMinutes(task.minutes, locale) }} ·
            {{ levelLabel(task.level) }}
          </span>
        </li>
      </ul>
    </section>

    <p class="zone__total">
      <strong>{{ t('zonesPage.totalTitle') }}:</strong>
      {{ zone.tasks }} {{ t('zonesPage.tasksCount') }} ·
      {{ formatDuration(zone.minutes, locale) }}
    </p>

    <section class="zone__cta">
      <h2 class="zone__cta-title">{{ t('zonesPage.planTitle') }}</h2>
      <p class="zone__cta-text">{{ t('zonesPage.planText') }}</p>
      <AppButton :to="localePath('/plan')" variant="filled" block>
        {{ t('zonesPage.planLink') }}
      </AppButton>
    </section>

    <nav class="zone__others" :aria-label="t('zonesPage.otherZones')">
      <h2 class="zone__others-title">{{ t('zonesPage.otherZones') }}</h2>
      <ul class="zone__others-list">
        <li v-for="item in otherZones" :key="item.slug">
          <NuxtLink :to="localePath(`/zones/${item.slug}`)" class="zone__other">
            {{ t(`tasks.zone.${item.slug}`, item.title) }}
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </article>
</template>

<style scoped>
.zone {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}

.zone__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  min-height: var(--tap-min);
  color: var(--c-text);
  text-decoration: none;
}

.zone__back:hover {
  color: var(--c-brand);
}

.zone__title {
  font-size: var(--fs-display);
}

.zone__lead,
.zone__group-meta,
.zone__task-meta,
.zone__cta-text,
.zone__total {
  color: var(--c-text-muted);
}

.zone__group {
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.zone__group-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.zone__group-title {
  font-size: var(--fs-title);
  font-weight: 600;
}

.zone__group-meta,
.zone__task-meta {
  font-size: var(--fs-caption);
}

.zone__tasks {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.zone__task {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--c-border);
}

.zone__task:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.zone__cta {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.zone__cta-title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.zone__others-title {
  font-size: var(--fs-body);
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.zone__others-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.zone__other {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  color: var(--c-text);
  text-decoration: none;
}

.zone__other:hover {
  border-color: var(--c-brand);
  color: var(--c-brand);
}
</style>
