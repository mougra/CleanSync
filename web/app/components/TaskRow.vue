<script setup lang="ts">
/**
 * Строка задачи из макетов: кружок-чекбокс, заголовок, необязательная подпись
 * и необязательная миниатюра справа. Без `interactive` — просто отображение.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    hint?: string | null;
    imageUrl?: string | null;
    /** Метка справа от заголовка: например, «каждый день». */
    badge?: string | null;
    done?: boolean;
    interactive?: boolean;
    disabled?: boolean;
    /**
     * task — розовая карточка задачи (чек-листы, план дня);
     * surface — светлая карточка на экране челленджа по макетам «осенний челлендж».
     */
    tone?: 'task' | 'surface';
    /** Обрезать подсказку до двух строк — так она выглядит в макетах челленджа. */
    clampHint?: boolean;
  }>(),
  {
    done: false,
    interactive: false,
    disabled: false,
    hint: null,
    imageUrl: null,
    badge: null,
    tone: 'task',
    clampHint: false,
  },
);

const emit = defineEmits<{ toggle: [] }>();

/**
 * Тег строки: интерактивная — кнопка, обычная — блок.
 *
 * Разметка у них одна и та же, отличается только тег и наличие обработчика,
 * поэтому шаблон не раздваивается: две копии одного и того же текста разошлись бы
 * при первой же правке.
 */
const tag = computed(() => (props.interactive ? 'button' : 'div'));

const rowAttrs = computed(() =>
  props.interactive
    ? { type: 'button' as const, disabled: props.disabled, 'aria-pressed': props.done }
    : {},
);

const rowClasses = computed(() => [
  'task',
  {
    'task--static': !props.interactive,
    'task--done': props.done,
    'task--surface': props.tone === 'surface',
  },
]);
</script>

<template>
  <!--
    Обёртка нужна только ради слота действия: у строки плана рядом с отметкой
    живёт своё действие (например «⋯» с удалением). Без слота разметка ровно
    прежняя — один узел, никаких обёрток.
  -->
  <div v-if="$slots.default" class="task-row task-row--action">
    <component
      :is="tag"
      v-bind="rowAttrs"
      :class="rowClasses"
      @click="interactive ? emit('toggle') : undefined"
    >
      <span class="task__check" aria-hidden="true">
        <i v-if="done" class="pi pi-check" />
      </span>
      <span class="task__text">
        <span class="task__title">
          {{ title }}
          <span v-if="badge" class="task__badge">{{ badge }}</span>
        </span>
        <small v-if="hint" :class="{ 'task__hint--clamp': clampHint }">{{ hint }}</small>
      </span>
      <img v-if="imageUrl" class="task__thumb" :src="imageUrl" :alt="title" >
    </component>

    <div class="task-row__action">
      <slot />
    </div>
  </div>

  <component
    :is="tag"
    v-else
    v-bind="rowAttrs"
    :class="rowClasses"
    @click="interactive ? emit('toggle') : undefined"
  >
    <span class="task__check" aria-hidden="true">
      <i v-if="done" class="pi pi-check" />
    </span>
    <span class="task__text">
      <span class="task__title">
        {{ title }}
        <span v-if="badge" class="task__badge">{{ badge }}</span>
      </span>
      <small v-if="hint" :class="{ 'task__hint--clamp': clampHint }">{{ hint }}</small>
    </span>
    <img v-if="imageUrl" class="task__thumb" :src="imageUrl" :alt="title" >
  </component>
</template>

<style scoped>
.task {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 64px;
  padding: var(--space-3) var(--space-4);
  border: none;
  border-radius: var(--r-row);
  background: var(--c-surface-task);
  color: var(--c-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

/*
 * Строка с действием: отметка занимает всю ширину, а компактная кнопка действия
 * стоит рядом с ней отдельным узлом. Внутрь кнопки её положить нельзя — вложенные
 * кнопки недопустимы, и нажатие на «⋯» отмечало бы задачу.
 */
.task-row--action {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
}

/* Отметка занимает всё свободное место, действие остаётся компактным */
.task-row--action > :first-child {
  flex: 1;
  min-width: 0;
}

.task-row__action {
  display: flex;
  align-items: center;
}

.task--static {
  cursor: default;
}

/*
 * Светлая карточка задачи: так выглядят строки на экране челленджа
 * (макеты «осенний челлендж 1–6»), в отличие от розовых строк чек-листов.
 */
.task--surface {
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.task:disabled {
  cursor: default;
  opacity: 0.75;
}

.task--done {
  opacity: 0.6;
  text-decoration: line-through;
}

.task__check {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border: 1.5px solid var(--c-brand);
  border-radius: var(--r-pill);
  color: var(--c-brand);
  font-size: 0.75rem;
}

.task__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.task__text small {
  color: var(--c-text-muted);
}

/* В макетах подсказка занимает не больше двух строк и обрывается многоточием */
.task__hint--clamp {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.task__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.task__badge {
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--c-surface-mint);
  color: var(--c-brand);
  font-size: 0.6875rem;
  font-weight: 600;
}

.task__thumb {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border-radius: var(--r-thumb);
  object-fit: cover;
}
</style>
