<script setup lang="ts">
/**
 * Кольцо «План на сегодня»: доля закрытых задач.
 *
 * Радиус и обводка заданы в единицах viewBox (128×128), поэтому кольцо
 * масштабируется без пересчёта. Дуга «доезжает» из пустого состояния:
 * на сервере рисуется пустое кольцо, на клиенте включается переход —
 * так прогресс виден движением, а не появляется рывком.
 */
const props = defineProps<{
  done: number;
  total: number;
}>();

const { t } = useI18n();

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const progress = computed(() => (props.total > 0 ? Math.min(1, Math.max(0, props.done / props.total)) : 0));
const offset = computed(() => CIRCUMFERENCE * (1 - progress.value));
const isComplete = computed(() => props.total > 0 && props.done >= props.total);

const mounted = ref(false);

onMounted(() => {
  // Один кадр паузы: без него браузер не увидит смену значения и не запустит переход
  requestAnimationFrame(() => {
    mounted.value = true;
  });
});
</script>

<template>
  <div class="ring" :class="{ 'ring--done': isComplete }">
    <span class="ring__glow" aria-hidden="true" />

    <svg
      class="ring__svg"
      viewBox="0 0 128 128"
      role="img"
      :aria-label="t('home.ringLabel', { done, total })"
    >
      <defs>
        <linearGradient id="planRingGradient" x1="18" y1="12" x2="110" y2="116" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#3f8a73" />
          <stop offset="1" stop-color="#2a584d" />
        </linearGradient>
      </defs>

      <circle class="ring__track" cx="64" cy="64" :r="RADIUS" />
      <circle
        class="ring__value"
        cx="64"
        cy="64"
        :r="RADIUS"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="mounted ? offset : CIRCUMFERENCE"
      />
    </svg>

    <div class="ring__center">
      <strong class="ring__done">{{ done }}</strong>
      <span class="ring__total">
        {{ total > 0 ? t('home.ofTasks', { total }) : t('home.noTasks') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
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
  stroke: url(#planRingGradient);
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset var(--dur-slow) var(--ease-out);
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

/* План выполнен: кольцо становится коралловым, как «готово» в макетах */
.ring--done .ring__value {
  stroke: var(--c-accent);
}

@media (prefers-reduced-motion: reduce) {
  .ring__value {
    transition: none;
  }
}
</style>
