<script setup lang="ts">
/**
 * Кнопка/ссылка дизайн-системы: всегда pill, три варианта по макетам.
 * С `to` рендерится ссылкой, без него — обычной кнопкой.
 */
withDefaults(
  defineProps<{
    to?: string;
    variant?: 'filled' | 'accent' | 'outline';
    disabled?: boolean;
    type?: 'button' | 'submit';
    block?: boolean;
  }>(),
  { variant: 'filled', disabled: false, type: 'button', block: false, to: undefined },
);
</script>

<template>
  <NuxtLink v-if="to" :to="to" class="btn" :class="[`btn--${variant}`, { 'btn--block': block }]">
    <slot />
  </NuxtLink>

  <button
    v-else
    :type="type"
    :disabled="disabled"
    class="btn"
    :class="[`btn--${variant}`, { 'btn--block': block }]"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 52px;
  padding: 0 var(--space-5);
  border-radius: var(--r-pill);
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.btn--block {
  width: 100%;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn--filled {
  border: none;
  background: var(--c-brand);
  color: var(--c-onbrand);
}

.btn--filled:hover:not(:disabled) {
  background: var(--c-brand-hover);
}

.btn--accent {
  border: none;
  background: var(--c-accent);
  color: var(--c-text-on-accent);
}

.btn--accent:hover:not(:disabled) {
  background: var(--c-accent-hover);
}

.btn--outline {
  border: 1.5px solid var(--c-brand);
  background: transparent;
  color: var(--c-brand);
}
</style>
