<script setup lang="ts">
/** Круглая кнопка «+» из макетов: быстрые действия (задача, чек-лист, челлендж). */
const { t } = useI18n();
const open = ref(false);
</script>

<template>
  <div class="fab">
    <button
      type="button"
      class="fab__button"
      :aria-expanded="open"
      :aria-label="t('home.openPlan')"
      @click="open = !open"
    >
      <i :class="['pi', open ? 'pi-times' : 'pi-plus']" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.fab {
  position: fixed;
  right: var(--space-4);
  bottom: calc(72px + env(safe-area-inset-bottom));
  z-index: 25;
}

.fab__button {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-brand);
  color: var(--c-onbrand);
  font-size: 1.25rem;
  cursor: pointer;
  box-shadow: var(--shadow-fab);
  transition:
    background-color 0.15s ease,
    transform 0.15s ease;
}

.fab__button:hover {
  background: var(--c-brand-hover);
}

.fab__button:active {
  transform: scale(0.96);
}

@media (min-width: 768px) {
  .fab {
    bottom: var(--space-5);
  }
}
</style>
