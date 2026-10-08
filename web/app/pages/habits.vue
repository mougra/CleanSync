<script setup lang="ts">
/**
 * «Привычки» — регулярные повторяющиеся уборки и серии дней.
 * Домен появится в Фазе 3 вместе с челленджами: привычка = задача с частотой
 * (daily/weekly) и счётчиком серии. Сейчас страница честно об этом сообщает.
 */
const { t } = useI18n();

useSeoMeta({ title: () => t('nav.habits') });
</script>

<template>
  <div class="page">
    <section class="card">
      <h2 class="card__title">{{ t('nav.habits') }}</h2>
      <p class="card__text">
        Здесь будут регулярные уборки с сериями: «полить цветы по вторникам»,
        «разобрать раковину раз в неделю». Данные появятся вместе с доменом челленджей —
        задачи уже умеют частоту, осталось показать прогресс и серии.
      </p>
      <NuxtLink to="/checklists" class="btn">{{ t('nav.checklists') }}</NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-5);
  border-radius: var(--r-card);
  background: var(--c-surface-warm);
}

.card__title {
  font-size: var(--fs-title);
}

.card__text {
  color: var(--c-text-muted);
}

.btn {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border-radius: var(--r-pill);
  background: var(--c-brand);
  color: var(--c-onbrand);
  font-weight: 600;
  text-decoration: none;
}
</style>
