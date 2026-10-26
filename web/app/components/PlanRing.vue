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
        <!--
          Две шкалы: обычная (бледный старт → брендовый зелёный) и финальная
          (зелёный → золото). Градиент задан в координатах viewBox, поэтому
          маленькая дуга показывает только светлый старт, а большая — глубокий
          зелёный; золото включается ровно на 100 %, когда план закрыт.
        -->
        <linearGradient id="planRingGradient" x1="18" y1="12" x2="110" y2="116" gradientUnits="userSpaceOnUse">
          <stop class="ring__stop-start" offset="0" />
          <stop class="ring__stop-end" offset="1" />
        </linearGradient>
        <linearGradient id="planRingGold" x1="18" y1="12" x2="110" y2="116" gradientUnits="userSpaceOnUse">
          <stop class="ring__stop-brand" offset="0" />
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
  /*
   * Цвет задаёт атрибут `stroke` в разметке (обычная или золотая шкала):
   * CSS-свойство перебило бы атрибут, поэтому здесь только толщина и анимация.
   */
  stroke-width: 10;
  stroke-linecap: round;
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

/* План выполнен: кольцо уходит в зелёно-золотую шкалу, свечение — тёплое. */
.ring--done .ring__glow {
  background: radial-gradient(circle at 50% 40%, var(--c-gold-soft) 0%, transparent 70%);
}

.ring--done .ring__done {
  color: var(--c-gold);
}

@media (prefers-reduced-motion: reduce) {
  .ring__value {
    transition: none;
  }
}
</style>
