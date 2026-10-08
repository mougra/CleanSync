<script setup lang="ts">
/** Прогресс-бар из макетов: тонкий трек и заливка брендовым цветом. */
const props = withDefaults(defineProps<{ value?: number; thin?: boolean }>(), {
  value: 0,
  thin: false,
});

const width = computed(() => `${Math.min(100, Math.max(0, props.value))}%`);
</script>

<template>
  <div class="progress" :class="{ 'progress--thin': thin }">
    <div class="progress__fill" :style="{ width }" />
  </div>
</template>

<style scoped>
.progress {
  height: 10px;
  border-radius: var(--r-pill);
  background: var(--c-track);
  overflow: hidden;
}

.progress--thin {
  height: 6px;
}

.progress__fill {
  height: 100%;
  border-radius: var(--r-pill);
  background: var(--c-brand);
  transition: width 0.25s ease;
}
</style>
