<script setup lang="ts">
/**
 * Приглашение пройти анкету о доме на главной.
 *
 * Показывается только вошедшему и только пока анкета не пройдена: по ответам
 * сервер собирает недельный план («Мои задачи»), поэтому без анкеты план дня
 * остаётся пустым.
 *
 * Прогресса «N из 12» здесь нет намеренно. `GET /api/home-profile` отдаёт
 * профиль уже с подставленными значениями по умолчанию (в БД ответы лежат в
 * колонках `NOT NULL DEFAULT`), поэтому отличить отвеченный шаг от нетронутого
 * на клиенте невозможно, и любой счётчик оказался бы выдуманным. Достоверно
 * известно одно: анкета пройдена или нет — по этому карточка и живёт.
 */
defineProps<{
  /** Куда ведёт кнопка — ссылка на мастер с `?setup=1`. */
  to: string;
}>();

const { t } = useI18n();
</script>

<template>
  <section class="card setup-card">
    <span class="setup-card__icon" aria-hidden="true"><i class="pi pi-home" /></span>

    <div class="setup-card__body">
      <h2 class="setup-card__title">{{ t('setupCard.title') }}</h2>
      <p class="setup-card__text">{{ t('setupCard.text') }}</p>

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

@media (min-width: 768px) {
  .setup-card {
    padding: var(--space-5);
  }
}
</style>
