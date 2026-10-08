<script setup lang="ts">
/** Коды локалей дублируют nuxt.config: нужен литеральный тип для setLocale. */
type AppLocale = 'ru' | 'en';

const { locale, locales, setLocale } = useI18n();

const available = computed(() =>
  // locales приходят объектами (LocaleObject) — приводим к простому виду для шаблона.
  (locales.value as Array<{ code: string; name?: string }>).map((item) => {
    const code = item.code as AppLocale;
    return { code, name: item.name ?? code.toUpperCase() };
  }),
);

const switchTo = (code: AppLocale) => {
  if (code !== locale.value) {
    void setLocale(code);
  }
};
</script>

<template>
  <div class="locale-switch" role="group" aria-label="Language">
    <button
      v-for="item in available"
      :key="item.code"
      type="button"
      class="locale-switch__item"
      :class="{ 'locale-switch__item--active': item.code === locale }"
      :aria-pressed="item.code === locale"
      @click="switchTo(item.code)"
    >
      {{ item.code.toUpperCase() }}
    </button>
  </div>
</template>

<style scoped>
.locale-switch {
  display: inline-flex;
  gap: var(--space-1);
  padding: 3px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
}

.locale-switch__item {
  min-width: 44px;
  min-height: 36px;
  padding: 0 var(--space-2);
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  font-weight: 600;
  cursor: pointer;
}

.locale-switch__item--active {
  background: var(--c-surface-mint);
  color: var(--c-brand);
}
</style>
