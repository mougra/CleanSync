<script setup lang="ts">
/**
 * Действия с привычкой: изменить или удалить.
 *
 * Отдельный лист, а не две кнопки в строке: строка отмечается одним тапом, и
 * удаление не должно случаться от промаха. Удаление спрашивает подтверждение
 * внутри того же листа — второй шторки ради этого не открываем.
 */
const props = defineProps<{
  open: boolean;
  title: string;
  /** Идёт запрос удаления: кнопки заблокированы. */
  pending?: boolean;
  /** Удаление не прошло: причина остаётся в листе. */
  error?: string;
}>();

const emit = defineEmits<{ close: []; edit: []; delete: [] }>();

const { t } = useI18n();

/** Подтверждение удаления: `false` — обычные действия, `true` — «точно удалить?». */
const confirming = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      confirming.value = false;
    }
  },
);
</script>

<template>
  <AppSheet :open="open" @close="emit('close')">
    <template #header>
      <div class="action">
        <span class="action__icon" aria-hidden="true"><i class="pi pi-ellipsis-h" /></span>
        <div class="action__head">
          <h2 class="action__title">{{ t('habits.actions') }}</h2>
          <p class="action__task">{{ title }}</p>
        </div>
      </div>
    </template>

    <div class="action__body">
      <p v-if="confirming" class="action__text">{{ t('habits.deleteText') }}</p>

      <p v-if="error" class="action__error" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <div v-if="!confirming" class="action__footer">
        <button type="button" class="action__edit" :disabled="pending" @click="emit('edit')">
          <i class="pi pi-pencil" aria-hidden="true" />
          {{ t('habits.edit') }}
        </button>

        <button type="button" class="action__remove" :disabled="pending" @click="confirming = true">
          <i class="pi pi-trash" aria-hidden="true" />
          {{ t('habits.remove') }}
        </button>
      </div>

      <div v-else class="action__footer">
        <button type="button" class="action__cancel" :disabled="pending" @click="confirming = false">
          {{ t('habits.cancel') }}
        </button>

        <button type="button" class="action__confirm" :disabled="pending" @click="emit('delete')">
          <i class="pi pi-trash" aria-hidden="true" />
          {{ t('habits.deleteConfirm') }}
        </button>
      </div>
    </template>
  </AppSheet>
</template>

<style scoped>
.action {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.action__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: var(--r-chip);
  background: var(--c-surface);
  color: var(--c-text-muted);
}

.action__head {
  min-width: 0;
}

.action__title {
  font-size: var(--fs-title);
}

.action__task {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.action__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.action__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.action__error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}

.action__footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.action__edit,
.action__remove,
.action__cancel,
.action__confirm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 52px;
  padding: 0 var(--space-5);
  border-radius: var(--r-pill);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

/* Изменить — акцентный контур: не опасное действие, но главное в листе. */
.action__edit {
  border: 1.5px solid var(--c-brand);
  background: transparent;
  color: var(--c-brand);
}

.action__edit:hover:not(:disabled) {
  background: var(--c-surface-mint);
}

/* Удалить — красный контур: заметно, но не перетягивает внимание с правки. */
.action__remove {
  border: 1.5px solid var(--c-danger);
  background: transparent;
  color: var(--c-danger);
}

.action__remove:hover:not(:disabled) {
  background: var(--c-accent-soft);
}

.action__cancel {
  border: 1px solid var(--c-border);
  background: transparent;
  color: var(--c-text);
}

.action__confirm {
  border: none;
  background: var(--c-danger);
  color: var(--c-text-on-accent);
}

.action__edit:disabled,
.action__remove:disabled,
.action__cancel:disabled,
.action__confirm:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
