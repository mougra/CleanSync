<script setup lang="ts">
/**
 * Визуальный эталон дизайн-системы: все токены и компоненты в одном месте,
 * чтобы сверять с макетами и проверять обе темы. Страница служебная.
 */
const { t } = useI18n();
const localePath = useLocalePath();

const palette = [
  { token: '--c-bg', note: 'фон' },
  { token: '--c-surface', note: 'белая карточка' },
  { token: '--c-surface-mint', note: 'челлендж, достижения' },
  { token: '--c-surface-warm', note: 'статистика' },
  { token: '--c-surface-task', note: 'задача' },
  { token: '--c-brand', note: 'бренд, FAB' },
  { token: '--c-accent', note: 'главное действие' },
  { token: '--c-amber', note: 'вторичный акцент' },
  { token: '--c-track', note: 'трек прогресса' },
];

const sampleTasks = [
  { title: 'Протереть выключатели и ручки дверей', hint: null, done: false },
  { title: 'Разобрать шкаф', hint: 'убрать 3 вещи на отдачу', done: false },
  { title: 'Проветрить помещение', hint: null, done: true },
];

useSeoMeta({ title: 'UI kit', robots: 'noindex' });
</script>

<template>
  <div class="kit">
    <h1 class="kit__title">UI kit</h1>
    <p class="kit__note">
      Служебная страница: токены, компоненты и состояния. Переключи тему в сайдбаре,
      чтобы проверить обе палитры.
    </p>

    <section class="block">
      <h2 class="block__title">Палитра</h2>
      <ul class="palette">
        <li v-for="color in palette" :key="color.token" class="palette__item">
          <span class="palette__swatch" :style="{ background: `var(${color.token})` }" />
          <span class="palette__meta">
            <code>{{ color.token }}</code>
            <small>{{ color.note }}</small>
          </span>
        </li>
      </ul>
    </section>

    <section class="block">
      <h2 class="block__title">Кнопки</h2>
      <div class="row">
        <AppButton variant="filled">Заполненная</AppButton>
        <AppButton variant="accent">Главное действие</AppButton>
        <AppButton variant="outline">Контурная</AppButton>
        <AppButton variant="filled" disabled>Недоступна</AppButton>
      </div>
    </section>

    <section class="block">
      <h2 class="block__title">Метки</h2>
      <div class="row">
        <AppBadge>Мятная</AppBadge>
        <AppBadge variant="amber">Охристая</AppBadge>
        <AppBadge variant="accent">Коралловая</AppBadge>
        <AppBadge variant="plain" icon="pi-flag">Без фона</AppBadge>
        <AppBadge dot>В процессе</AppBadge>
      </div>
    </section>

    <section class="block">
      <h2 class="block__title">Прогресс</h2>
      <div class="stack">
        <ProgressBar :value="0" />
        <ProgressBar :value="35" />
        <ProgressBar :value="100" />
        <ProgressBar thin :value="60" />
      </div>
    </section>

    <section class="block">
      <h2 class="block__title">Строки задач</h2>
      <ul class="tasks">
        <li v-for="task in sampleTasks" :key="task.title">
          <TaskRow :title="task.title" :hint="task.hint" :done="task.done" interactive />
        </li>
      </ul>
    </section>

    <section class="block">
      <h2 class="block__title">Карточки челленджей</h2>
      <div class="stack">
        <ChallengeCard
          title="Весенняя уборка"
          :badge-label="t('home.inProgress')"
          :progress="{ done: 12, total: 35, percent: 34, currentDay: 3, minutesLeft: 55 }"
          :to="localePath('/challenges/vesennyaya-uborka')"
        />
        <ChallengeCard
          title="Осеннее обновление дома"
          description="Подготовь дом к холодам"
          :badge-label="t('home.challenges')"
          :to="localePath('/challenges/osennee-obnovlenie-doma')"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.kit {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.kit__title {
  font-size: var(--fs-display);
}

.kit__note {
  color: var(--c-text-muted);
}

.block {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.block__title {
  font-size: var(--fs-caption);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-text-muted);
}

.palette {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-3);
}

.palette__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border-radius: var(--r-chip);
  background: var(--c-surface);
}

.palette__swatch {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-chip);
}

.palette__meta {
  display: flex;
  flex-direction: column;
}

.palette__meta small {
  color: var(--c-text-muted);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tasks {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
