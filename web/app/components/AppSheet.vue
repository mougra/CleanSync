<script setup lang="ts">
/**
 * Нижний лист (bottom sheet) из макетов: на мобильном выезжает снизу,
 * на десктопе показывается модальным окном по центру.
 *
 * Закрытый лист остаётся в разметке (`v-show`, а не `v-if`): так его содержимое
 * попадает в серверный HTML, и страница знает про свои действия ещё до того, как
 * клиент поднимет приложение. Заодно это снимает расхождение гидратации.
 * Затемнение при этом монтируется только у открытого листа: в статичном HTML
 * полупрозрачный слой поверх страницы был бы виден без всякого листа.
 */
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    emit('close');
  }
};

watch(
  () => props.open,
  (open) => {
    if (!import.meta.client) {
      return;
    }
    document.body.style.overflow = open ? 'hidden' : '';
  },
);

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  if (import.meta.client) {
    document.body.style.overflow = '';
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-show="open" class="sheet" role="dialog" aria-modal="true" :aria-hidden="!open">
      <div v-if="open" class="sheet__backdrop" @click="emit('close')" />

      <div class="sheet__panel">
        <header class="sheet__header">
          <div class="sheet__heading">
            <slot name="header" />
          </div>
          <button
            type="button"
            class="sheet__close"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <i class="pi pi-times" aria-hidden="true" />
          </button>
        </header>

        <div class="sheet__body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="sheet__footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(12 18 16 / 45%);
}

.sheet__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 92vh;
  border-radius: var(--r-card) var(--r-card) 0 0;
  background: var(--c-bg);
  box-shadow: 0 -8px 40px rgb(0 0 0 / 24%);
}

.sheet__header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-3);
}

.sheet__heading {
  flex: 1;
  min-width: 0;
}

.sheet__close {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  flex: 0 0 var(--tap-min);
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text);
  cursor: pointer;
}

.sheet__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 var(--space-4) var(--space-4);
}

.sheet__footer {
  padding: var(--space-3) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--c-border);
  background: var(--c-bg);
}

@media (min-width: 768px) {
  .sheet {
    align-items: center;
  }

  .sheet__panel {
    max-width: 520px;
    max-height: 88vh;
    border-radius: var(--r-card);
  }
}
</style>
