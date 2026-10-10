<script setup lang="ts">
/**
 * «Как пользоваться приложением» — короткая инструкция по разделам.
 *
 * Тексты лежат в i18n: страница целиком текстовая, и её нужно переводить.
 */
const { t } = useI18n();
const localePath = useLocalePath();

const sections = [
  { key: 'challenges', icon: 'pi-flag' },
  { key: 'habits', icon: 'pi-refresh' },
  { key: 'checklists', icon: 'pi-list-check' },
  { key: 'family', icon: 'pi-users' },
  { key: 'streak', icon: 'pi-bolt' },
  { key: 'stats', icon: 'pi-chart-bar' },
  { key: 'notifications', icon: 'pi-bell' },
] as const;

useSeoMeta({ title: () => t('guide.title'), robots: 'noindex, nofollow' });
</script>

<template>
  <article class="guide">
    <NuxtLink :to="localePath('/settings')" class="guide__back">
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('nav.settings') }}
    </NuxtLink>

    <h1 class="guide__title">{{ t('guide.title') }}</h1>
    <p class="guide__lead">{{ t('guide.lead') }}</p>

    <ol class="guide__list">
      <li v-for="section in sections" :key="section.key" class="step">
        <span class="step__icon" aria-hidden="true"><i :class="['pi', section.icon]" /></span>
        <div>
          <h2 class="step__title">{{ t(`guide.${section.key}Title`) }}</h2>
          <p class="step__body">{{ t(`guide.${section.key}Body`) }}</p>
        </div>
      </li>
    </ol>

    <p class="guide__footer">
      {{ t('guide.contact') }}
      <a href="mailto:tidyflowup@gmail.com">tidyflowup@gmail.com</a>
    </p>
  </article>
</template>

<style scoped>
.guide {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}

.guide__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  min-height: var(--tap-min);
  color: var(--c-text);
  text-decoration: none;
}

.guide__back:hover {
  color: var(--c-brand);
}

.guide__title {
  font-size: var(--fs-display);
}

.guide__lead {
  color: var(--c-text-muted);
}

.guide__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.step {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface);
}

.step__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: var(--r-row);
  background: var(--c-surface-mint);
  color: var(--c-brand);
}

.step__title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.step__body {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.guide__footer {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.guide__footer a {
  color: var(--c-brand);
}
</style>
