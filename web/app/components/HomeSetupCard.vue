<script setup lang="ts">
import { HOME_SETUP_STEP_COUNT, countAnsweredSteps } from '~/utils/homeSetupSteps';

/**
 * Приглашение пройти анкету о доме на главной.
 *
 * Показывается только вошедшему и только пока анкета не пройдена: по ответам
 * сервер собирает недельный план («Мои задачи»), поэтому без анкеты план дня
 * остаётся пустым.
 *
 * Прогресс «N из 12» считаем по `answeredFields` — списку полей, которые
 * человек заполнил явно (сервер копит их при каждом `PUT`). Сам профиль для
 * этого не годится: в нём лежат подставленные значения по умолчанию, и
 * отвеченный шаг не отличить от пропущенного. Правило «шаг → поля» одно на всё
 * приложение и живёт в `utils/homeSetupSteps.ts`, поэтому карточка и мастер
 * считают одинаково.
 */
defineProps<{
  /** Куда ведёт кнопка — ссылка на мастер с `?setup=1`. */
  to: string;
}>();

const { t } = useI18n();
const { answeredFields } = await useHomeProfile();

/**
 * Прогресс текстом. Если данных нет или ни один шаг не пройден, показываем
 * «не пройдена»: выдуманное «0 из 12» читалось бы как ответ на анкету.
 */
const progress = computed(() => {
  const done = countAnsweredSteps(answeredFields.value);

  return done > 0
    ? t('homeSetup.progress', { done, total: HOME_SETUP_STEP_COUNT })
    : t('homeSetup.incomplete');
});
</script>

<template>
  <section class="card setup-card">
    <span class="setup-card__icon" aria-hidden="true"><i class="pi pi-home" /></span>

    <div class="setup-card__body">
      <h2 class="setup-card__title">{{ t('setupCard.title') }}</h2>
      <p class="setup-card__text">{{ t('setupCard.text') }}</p>
      <p class="setup-card__progress">{{ progress }}</p>

      <AppButton variant="accent" :to="to">{{ t('setupCard.cta') }}</AppButton>
    </div>
  </section>
</template>

<style scoped>
.setup-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--c-surface-warm);
}

.setup-card__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  border-radius: var(--r-thumb);
  background: var(--c-surface);
  color: var(--c-brand);
  font-size: 1.25rem;
}

.setup-card__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  min-width: 0;
}

.setup-card__title {
  font-size: var(--fs-title);
}

.setup-card__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.setup-card__progress {
  color: var(--c-brand);
  font-size: var(--fs-caption);
  font-weight: 600;
}

@media (min-width: 768px) {
  .setup-card {
    padding: var(--space-5);
  }
}
</style>
