<script setup lang="ts">
/**
 * Список зон дома.
 *
 * Данные приходят из каталога задач (`/api/catalog/zones`), поэтому страница
 * живёт в паре с `zones/[slug].vue`: вместе они дают поисковику и человеку
 * разложенный по комнатам каталог, из которого собирается план приложения.
 *
 * Название зоны переводим на клиенте по коду (`tasks.zone.<slug>`), а не берём
 * `title` из ответа: интерфейс и заголовок страницы должны совпадать по языку,
 * даже если API ответил на другом (правило 42).
 */
import type { ZonesResponse } from '~/types/catalog';

const { t, locale } = useI18n();
const localePath = useLocalePath();
const { request } = useApi();

const { data } = await useAsyncData('catalog-zones', () =>
  request<ZonesResponse>('/api/catalog/zones'),
);

const zones = computed(() => data.value?.zones ?? []);

const zoneName = (slug: string, fallback: string) =>
  t(`tasks.zone.${slug}`, fallback);

useSeoMeta({
  title: () => t('zonesPage.title'),
  description: () => t('zonesPage.lead'),
  ogTitle: () => t('zonesPage.title'),
  ogDescription: () => t('zonesPage.lead'),
});
</script>

<template>
  <div class="zones">
    <NuxtLink :to="localePath('/tips')" class="zones__back">
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('nav.tips') }}
    </NuxtLink>

    <h1 class="zones__title">{{ t('zonesPage.title') }}</h1>
    <p class="zones__lead">{{ t('zonesPage.lead') }}</p>

    <ul class="zones__list">
      <li v-for="zone in zones" :key="zone.slug">
        <NuxtLink :to="localePath(`/zones/${zone.slug}`)" class="zone-card">
          <span class="zone-card__name">{{ zoneName(zone.slug, zone.title) }}</span>
          <span class="zone-card__meta">
            {{ zone.tasks }} {{ t('zonesPage.tasksCount') }} ·
            {{ formatDuration(zone.minutes, locale) }}
          </span>
        </NuxtLink>
      </li>
    </ul>

    <section class="zones__cta">
      <h2 class="zones__cta-title">{{ t('zonesPage.planTitle') }}</h2>
      <p class="zones__cta-text">{{ t('zonesPage.planText') }}</p>
      <AppButton :to="localePath('/plan')" variant="filled" block>
        {{ t('zonesPage.planLink') }}
      </AppButton>
    </section>
  </div>
</template>

<style scoped>
.zones {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}

.zones__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  min-height: var(--tap-min);
  color: var(--c-text);
  text-decoration: none;
}

.zones__back:hover,
.zone-card:hover .zone-card__name {
  color: var(--c-brand);
}

.zones__title {
  font-size: var(--fs-display);
}

.zones__lead {
  color: var(--c-text-muted);
}

.zones__list {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}

.zone-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-height: var(--tap-min);
  padding: var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-card);
  background: var(--c-surface);
  color: var(--c-text);
  text-decoration: none;
}

.zone-card__name {
  font-weight: 600;
}

.zone-card__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.zones__cta {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.zones__cta-title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.zones__cta-text {
  color: var(--c-text-muted);
}
</style>
