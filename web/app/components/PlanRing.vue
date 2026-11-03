<script setup lang="ts">
/**
 * Кольцо «План на сегодня»: доля закрытых задач.
 *
 * Второе, внутреннее кольцо — привычки на сегодня. Две шкалы живут в одной
 * картинке намеренно: это два слоя одного дня, и человеку нужно видеть их вместе
 * («дела закрыты, а привычки — нет»), а не на двух экранах.
 *
 * Цвета разные, потому что одинаковые кольца читались бы как одно: задачи —
 * зелёные (бренд), привычки — коралловые (акцент). На 100 % обе уходят в золото:
 * это один и тот же «готово», а не два разных праздника.
 *
 * Радиус и обводка заданы в единицах viewBox (128×128), поэтому кольцо
 * масштабируется без пересчёта. Дуга «доезжает» из пустого состояния:
 * на сервере рисуется пустое кольцо, на клиенте включается переход —
 * так прогресс виден движением, а не появляется рывком.
 */
const props = withDefaults(
  defineProps<{
    done: number;
    total: number;
    /** Внутреннее кольцо привычек: 0 / 0 — его нет вовсе. */
    innerDone?: number;
    innerTotal?: number;
  }>(),
  { innerDone: 0, innerTotal: 0 },
);

const { t, locale } = useI18n();

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Внутреннее кольцо почти вплотную к внешнему: 4 единицы viewBox между ними. */
const INNER_RADIUS = 39;
const INNER_STROKE = 8;
const INNER_CIRCUMFERENCE = 2 * Math.PI * INNER_RADIUS;

const progress = computed(() => (props.total > 0 ? Math.min(1, Math.max(0, props.done / props.total)) : 0));
const offset = computed(() => CIRCUMFERENCE * (1 - progress.value));
const isComplete = computed(() => props.total > 0 && props.done >= props.total);

const hasHabits = computed(() => props.innerTotal > 0);
const habitsProgress = computed(() =>
  props.innerTotal > 0 ? Math.min(1, Math.max(0, props.innerDone / props.innerTotal)) : 0,
);
const habitsOffset = computed(() => INNER_CIRCUMFERENCE * (1 - habitsProgress.value));
const habitsComplete = computed(
  () => props.innerTotal > 0 && props.innerDone >= props.innerTotal,
);

/** «привычки» / «привычек»: подпись внутри кольца, по числу привычек дня. */
const habitsLabel = computed(() => {
  const count = props.innerTotal;

  if (locale.value !== 'ru') {
    return count === 1 ? t('habits.count_one') : t('habits.count_many');
  }

  return pluralRu(count, t('habits.count_one'), t('habits.count_few'), t('habits.count_many'));
});

/** Озвучка обеих шкал: кольцо — картинка, и без подписи она ничего не сообщает. */
const ariaLabel = computed(() => {
  const parts = [t('home.ringLabel', { done: props.done, total: props.total })];

  if (hasHabits.value) {
    parts.push(t('home.ringHabitsAria', { done: props.innerDone, total: props.innerTotal }));
  }

  return parts.join('. ');
});

const mounted = ref(false);

onMounted(() => {
  // Один кадр паузы: без него браузер не увидит смену значения и не запустит переход
  requestAnimationFrame(() => {
    mounted.value = true;
  });
});
</script>

<template>
  <div class="plan-ring">
    <div class="ring" :class="{ 'ring--done': isComplete }">
      <span class="ring__glow" aria-hidden="true" />

      <svg class="ring__svg" viewBox="0 0 128 128" role="img" :aria-label="ariaLabel">
        <defs>
          <!--
            Две шкалы: обычная (бледный старт → брендовый зелёный) и финальная
            (зелёный → золото). Градиент задан в координатах viewBox, поэтому
            маленькая дуга показывает только светлый старт, а большая — глубокий
            зелёный; золото включается ровно на 100 %, когда план закрыт.
          -->
          <linearGradient
            id="planRingGradient"
            x1="18"
            y1="12"
            x2="110"
            y2="116"
            gradientUnits="userSpaceOnUse"
          >
            <stop class="ring__stop-start" offset="0" />
            <stop class="ring__stop-end" offset="1" />
          </linearGradient>
          <linearGradient
            id="planRingGold"
            x1="18"
            y1="12"
            x2="110"
            y2="116"
            gradientUnits="userSpaceOnUse"
          >
            <stop class="ring__stop-brand" offset="0" />
            <stop class="ring__stop-gold" offset="0.6" />
            <stop class="ring__stop-gold-soft" offset="1" />
          </linearGradient>

          <!-- Привычки: свой цвет в работе, золото на 100 % — как у задач -->
          <linearGradient
            id="planRingHabits"
            x1="18"
            y1="12"
            x2="110"
            y2="116"
            gradientUnits="userSpaceOnUse"
          >
            <stop class="ring__stop-accent-start" offset="0" />
            <stop class="ring__stop-accent-end" offset="1" />
          </linearGradient>
          <linearGradient
            id="planRingHabitsGold"
            x1="18"
            y1="12"
            x2="110"
            y2="116"
            gradientUnits="userSpaceOnUse"
          >
            <stop class="ring__stop-accent-start" offset="0" />
            <stop class="ring__stop-gold" offset="0.6" />
            <stop class="ring__stop-gold-soft" offset="1" />
          </linearGradient>
        </defs>

        <circle class="ring__track" cx="64" cy="64" :r="RADIUS" />
        <circle
          class="ring__value"
          cx="64"
          cy="64"
          :r="RADIUS"
          :stroke="isComplete ? 'url(#planRingGold)' : 'url(#planRingGradient)'"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="mounted ? offset : CIRCUMFERENCE"
        />

        <!--
          Внутреннее кольцо привычек: рисуется только когда привычки на сегодня
          есть. Пустая окружность «0 из 0» сообщала бы, что человек что-то не
          сделал, хотя делать было нечего.
        -->
        <template v-if="hasHabits">
          <circle class="ring__habits-track" cx="64" cy="64" :r="INNER_RADIUS" />
          <circle
            class="ring__habits-value"
            cx="64"
            cy="64"
            :r="INNER_RADIUS"
            :stroke="habitsComplete ? 'url(#planRingHabitsGold)' : 'url(#planRingHabits)'"
            :stroke-width="INNER_STROKE"
            :stroke-dasharray="INNER_CIRCUMFERENCE"
            :stroke-dashoffset="mounted ? habitsOffset : INNER_CIRCUMFERENCE"
          />
        </template>
      </svg>

    <div class="ring__center">
      <strong class="ring__done">{{ done }}</strong>
      <span class="ring__total">
        {{ total > 0 ? t('home.ofTasks', { total }) : t('home.noTasks') }}
      </span>
    </div>
  </div>

    <!--
      Подпись привычек — под кольцом, а не в центре: «2 из 5» и «1/4 привычки» в
      одном кружке не помещаются, а ужимать шрифт значило бы сделать цифры
      нечитаемыми. Точка цвета внутренней дуги связывает текст с кольцом.
    -->
    <p
      v-if="hasHabits"
      class="plan-ring__legend"
      :class="{ 'plan-ring__legend--done': habitsComplete }"
    >
      <i class="plan-ring__legend-dot" aria-hidden="true" />
      {{ innerDone }}/{{ innerTotal }} {{ habitsLabel }}
    </p>
  </div>
</template>

<style scoped>
/* Обёртка: кольцо и подпись второй шкалы стоят столбиком и центрируются. */
.plan-ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}

.ring {
  position: relative;
  display: grid;
  place-items: center;
  width: 152px;
  height: 152px;
  flex: none;
}

/* Мягкое свечение за кольцом: декор, а не смысл */
.ring__glow {
  position: absolute;
  inset: 6%;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, var(--c-surface-mint) 0%, transparent 70%);
  opacity: 0.9;
}

.ring__svg {
  position: relative;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring__track {
  fill: none;
  stroke: var(--c-track);
  stroke-width: 10;
}

.ring__value {
  fill: none;
  /*
   * Цвет задаёт атрибут `stroke` в разметке (обычная или золотая шкала):
   * CSS-свойство перебило бы атрибут, поэтому здесь только толщина и анимация.
   */
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset var(--dur-slow) var(--ease-out);
}

/* ── Внутреннее кольцо привычек ─────────────────────────────────────── */
.ring__habits-track,
.ring__habits-value {
  fill: none;
  stroke-linecap: round;
}

.ring__habits-track {
  stroke: var(--c-track);
  stroke-width: 8;
}

.ring__habits-value {
  /* Толщина приходит атрибутом: она же нужна окружности для длины дуги */
  transition: stroke-dashoffset var(--dur-slow) var(--ease-out);
}

/* Цвета градиентов берём из токенов: hex в компоненте нарушал бы тему. */
.ring__stop-start {
  stop-color: var(--c-ring-start);
}

.ring__stop-end,
.ring__stop-brand {
  stop-color: var(--c-brand);
}

.ring__stop-accent-start {
  stop-color: var(--c-accent);
}

.ring__stop-accent-end {
  stop-color: var(--c-accent-hover);
}

.ring__stop-gold {
  stop-color: var(--c-gold);
}

.ring__stop-gold-soft {
  stop-color: var(--c-gold-soft);
}

.ring__center {
  position: absolute;
  display: grid;
  place-items: center;
  gap: 2px;
  text-align: center;
}

.ring__done {
  font-size: 2.25rem;
  line-height: 1;
  color: var(--c-brand);
}

.ring__total {
  font-size: var(--fs-caption);
  color: var(--c-text-muted);
}

/* Подпись привычек: точка цвета кольца связывает текст с внутренней дугой. */
.plan-ring__legend {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  color: var(--c-text-muted);
  font-size: 0.75rem;
  line-height: 1.2;
}

.plan-ring__legend-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: var(--r-pill);
  background: var(--c-accent);
}

.plan-ring__legend--done {
  color: var(--c-gold);
}

.plan-ring__legend--done .plan-ring__legend-dot {
  background: var(--c-gold);
}

/* План выполнен: кольцо уходит в зелёно-золотую шкалу, свечение — тёплое. */
.ring--done .ring__glow {
  background: radial-gradient(circle at 50% 40%, var(--c-gold-soft) 0%, transparent 70%);
}

.ring--done .ring__done {
  color: var(--c-gold);
}

@media (prefers-reduced-motion: reduce) {
  .ring__value,
  .ring__habits-value {
    transition: none;
  }
}
</style>
