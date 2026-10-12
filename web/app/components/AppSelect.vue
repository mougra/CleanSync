<script setup lang="ts">
/**
 * Выпадающий список вместо нативного `<select>`.
 *
 * Нативный список рисует сам браузер: в тёмной теме он остаётся светлым, с чужим
 * шрифтом и отступами, а на телефоне превращается в системный «барабан». Свой
 * список оформлен токенами, поддерживает клавиатуру (стрелки, Home/End, Enter,
 * Escape) и рисуется **поверх любых шторок**: он телепортируется в `body` и
 * позиционируется от кнопки, иначе родительский `overflow` его обрезал бы.
 */
interface SelectOption {
  value: string | number;
  label: string;
}

const props = withDefaults(
  defineProps<{
    /**
     * Выбранное значение. `null` допускается: у списков вроде «исполнитель» есть
     * состояние «не выбрано», и вызывающий код хранит его именно так.
     */
    modelValue: string | number | null;
    options: SelectOption[];
    disabled?: boolean;
    ariaLabel?: string;
    /** Компактный вид для строк в карточках (меньше высота и отступы). */
    compact?: boolean;
  }>(),
  { disabled: false, ariaLabel: undefined, compact: false }
);

const emit = defineEmits<{ 'update:modelValue': [string | number] }>();

const open = ref(false);
const activeIndex = ref(0);
const trigger = ref<HTMLButtonElement | null>(null);
const popup = ref<HTMLElement | null>(null);

/** Куда поставить список: под кнопкой или над ней, если снизу нет места. */
const position = ref({ left: 0, top: 0, width: 0, openUp: false });

const selected = computed(() => props.options.find((option) => option.value === props.modelValue));
const selectedLabel = computed(() => selected.value?.label ?? '');

/** Высота списка ограничена, поэтому прокрутка живёт внутри него. */
const MAX_LIST_HEIGHT = 264;

const place = () => {
  const rect = trigger.value?.getBoundingClientRect();

  if (!rect) return;

  const listHeight = Math.min(MAX_LIST_HEIGHT, props.options.length * 44 + 12);
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < listHeight + 12 && rect.top > spaceBelow;

  position.value = {
    left: rect.left,
    top: openUp ? rect.top - 6 : rect.bottom + 6,
    width: rect.width,
    openUp,
  };
};

const openList = () => {
  if (props.disabled) return;

  activeIndex.value = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.modelValue)
  );
  place();
  open.value = true;
};

const closeList = () => {
  open.value = false;
};

const toggle = () => (open.value ? closeList() : openList());

const choose = (option: SelectOption) => {
  emit('update:modelValue', option.value);
  closeList();
  trigger.value?.focus();
};

const move = (step: number) => {
  if (!open.value) {
    openList();
    return;
  }

  const next = activeIndex.value + step;

  if (next < 0 || next >= props.options.length) return;

  activeIndex.value = next;
};

const onKeydown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      move(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      move(-1);
      break;
    case 'Home':
      if (open.value) {
        event.preventDefault();
        activeIndex.value = 0;
      }
      break;
    case 'End':
      if (open.value) {
        event.preventDefault();
        activeIndex.value = props.options.length - 1;
      }
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      if (open.value) choose(props.options[activeIndex.value] as SelectOption);
      else openList();
      break;
    case 'Escape':
      if (open.value) {
        event.preventDefault();
        closeList();
      }
      break;
    default:
      break;
  }
};

/** Закрытие по клику вне кнопки и списка: список живёт в `body`, поэтому проверяем оба. */
const onPointerDown = (event: PointerEvent) => {
  const target = event.target as Node;

  if (trigger.value?.contains(target) || popup.value?.contains(target)) return;

  closeList();
};

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('scroll', closeList, true);
  window.addEventListener('resize', closeList);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('scroll', closeList, true);
  window.removeEventListener('resize', closeList);
});
</script>

<template>
  <div class="select" :class="{ 'select--compact': compact }">
    <button
      ref="trigger"
      type="button"
      class="select__trigger"
      :class="{ 'select__trigger--open': open }"
      :disabled="disabled"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="select__value">{{ selectedLabel }}</span>
      <i class="pi pi-chevron-down select__chevron" aria-hidden="true" />
    </button>

    <Teleport to="body">
      <ul
        v-if="open"
        ref="popup"
        class="select__list"
        role="listbox"
        :aria-label="ariaLabel"
        :style="{
          left: `${position.left}px`,
          top: `${position.top}px`,
          width: `${position.width}px`,
          maxHeight: `${MAX_LIST_HEIGHT}px`,
          transform: position.openUp ? 'translateY(-100%)' : undefined,
        }"
      >
        <li
          v-for="(option, index) in options"
          :key="option.value"
          class="select__option"
          :class="{
            'select__option--active': index === activeIndex,
            'select__option--selected': option.value === modelValue,
          }"
          role="option"
          :aria-selected="option.value === modelValue"
          @pointerenter="activeIndex = index"
          @click="choose(option)"
        >
          <span>{{ option.label }}</span>
          <i v-if="option.value === modelValue" class="pi pi-check" aria-hidden="true" />
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.select {
  position: relative;
  width: 100%;
}

.select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  font-size: var(--fs-body);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}

.select__trigger:hover:not(:disabled) {
  border-color: var(--c-accent);
}

.select__trigger:focus-visible {
  outline: none;
  border-color: var(--c-accent);
  box-shadow: 0 0 0 3px var(--c-accent-soft);
}

.select__trigger:disabled {
  opacity: 0.55;
  cursor: default;
}

.select__trigger--open {
  border-color: var(--c-accent);
}

.select__value {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.select__chevron {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--c-text-muted);
  transition: transform var(--dur-fast) var(--ease-out);
}

.select__trigger--open .select__chevron {
  transform: rotate(180deg);
}

.select--compact .select__trigger {
  min-height: 36px;
  padding: 0 var(--space-3);
  border-radius: var(--r-pill);
  font-size: var(--fs-caption);
}

/*
 * Список живёт в `body` (телепорт), поэтому его стили не скоупятся родителем —
 * класс помечен `scoped`, но узел вне компонента, и Nuxt добавит атрибут
 * автоматически: элемент создаётся этим же шаблоном.
 */
.select__list {
  position: fixed;
  z-index: 90;
  margin: 0;
  padding: var(--space-1);
  list-style: none;
  overflow-y: auto;
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-bg);
  box-shadow: var(--shadow-lift);
}

.select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 40px;
  padding: 0 var(--space-3);
  border-radius: var(--r-inner, 12px);
  color: var(--c-text);
  font-size: var(--fs-body);
  cursor: pointer;
}

.select__option--active {
  background: var(--c-surface);
}

.select__option--selected {
  color: var(--c-accent);
  font-weight: 600;
}

.select__option i {
  font-size: 0.75rem;
}
</style>
