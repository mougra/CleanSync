<script setup lang="ts">
/**
 * Строка настроек: иконка, название, значение и управление справа.
 *
 * Один компонент на все случаи — переход (`to`), переключатель или раскрытие
 * (`body`), чтобы страница настроек оставалась компактным списком, а не
 * набором растянутых карточек.
 */
const props = withDefaults(
  defineProps<{
    icon: string;
    title: string;
    value?: string;
    to?: string;
    tone?: 'default' | 'danger';
    /** Раскрывается по нажатию: содержимое передаётся в слот body. */
    expandable?: boolean;
  }>(),
  { value: '', to: '', tone: 'default', expandable: false },
);

const slots = useSlots();
const open = ref(false);

const hasBody = computed(() => Boolean(slots.body));
const isToggle = computed(() => props.expandable || hasBody.value);
</script>

<template>
  <component
    :is="to ? 'NuxtLink' : 'div'"
    :to="to || undefined"
    class="row"
    :class="[`row--${tone}`, { 'row--button': isToggle }]"
    @click="isToggle && (open = !open)"
  >
    <span class="row__icon" aria-hidden="true"><i :class="['pi', icon]" /></span>
    <span class="row__title">{{ title }}</span>

    <span v-if="$slots.control" class="row__control" @click.stop>
      <slot name="control" />
    </span>
    <span v-else-if="value" class="row__value">{{ value }}</span>

    <i
      v-if="isToggle"
      class="pi pi-chevron-down row__chevron"
      :class="{ 'row__chevron--open': open }"
      aria-hidden="true"
    />
    <i v-else-if="to" class="pi pi-chevron-right row__chevron" aria-hidden="true" />
  </component>

  <div v-if="isToggle && open && $slots.body" class="row__body">
    <slot name="body" />
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-2) var(--space-3);
  color: var(--c-text);
  text-decoration: none;
  border-bottom: 1px solid var(--c-border);
}

.row:last-child {
  border-bottom: none;
}

.row--button {
  cursor: pointer;
}

.row:hover {
  background: var(--c-surface-sunken);
}

.row--danger {
  color: var(--c-danger);
}

.row__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: var(--r-row);
  background: var(--c-surface-mint);
  color: var(--c-brand);
}

.row--danger .row__icon {
  background: var(--c-surface-warm);
  color: var(--c-danger);
}

.row__title {
  flex: 1;
  min-width: 0;
}

.row__value {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.row__control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.row__chevron {
  color: var(--c-text-muted);
  font-size: 0.75rem;
  transition: transform 0.15s ease;
}

.row__chevron--open {
  transform: rotate(180deg);
}

.row__body {
  padding: var(--space-3);
  border-bottom: 1px solid var(--c-border);
  background: var(--c-surface-sunken);
}

.row__body :deep(.field) {
  margin-bottom: var(--space-3);
}
</style>
