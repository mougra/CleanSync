<script setup lang="ts">
/** Метка-чип из макетов: мятная, охристая, розовая или без фона. */
withDefaults(
  defineProps<{
    variant?: 'mint' | 'amber' | 'plain' | 'accent';
    icon?: string;
    dot?: boolean;
  }>(),
  { variant: 'mint', dot: false, icon: undefined },
);
</script>

<template>
  <span class="badge" :class="`badge--${variant}`">
    <i v-if="dot" class="pi pi-circle-fill badge__dot" aria-hidden="true" />
    <i v-else-if="icon" :class="['pi', icon]" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: var(--r-pill);
  font-size: var(--fs-caption);
  font-weight: 600;
}

.badge--mint {
  background: var(--c-bg);
  color: var(--c-brand);
}

.badge--amber {
  background: var(--c-amber-soft);
  color: var(--c-amber);
}

.badge--accent {
  background: var(--c-accent-soft);
  color: var(--c-accent);
}

.badge--plain {
  padding-left: 0;
  background: transparent;
  color: var(--c-brand);
}

.badge__dot {
  font-size: 0.5rem;
}
</style>
