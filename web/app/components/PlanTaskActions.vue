<script setup lang="ts">
/**
 * Действия со строкой «Плана на сегодня»: «⋯» раскрывает кружки вверх.
 *
 * Раньше «⋯» открывал нижний лист, и до выбора действия человек не видел, что
 * вообще можно сделать. Теперь из кнопки «вырастает» стопка круглых кнопок —
 * «Изменить» и удаление, — а наведение и фокус объясняют каждую тултипом.
 *
 * Порядок снизу вверх: «Изменить» стоит ближе всех к «⋯» как основное действие,
 * а необратимое удаление — выше всех, дальше от места нажатия. Промах по строке
 * остаётся отметкой: строка — отдельная кнопка, а «⋯» живёт рядом с ней.
 *
 * Выбор действия ничего не делает сам: компонент только сообщает намерение
 * (`edit` / `delete`), а окна открывает страница — ей же принадлежат запросы и
 * последствия (см. `index.vue`).
 */
const props = withDefaults(
  defineProps<{
    /**
     * `true` — задача собрана сервером, `false` — создана человеком.
     *
     * От этого зависит текст удаления: у сгенерированной задачи человек
     * отказывается от предложения («Больше не предлагать», иконка `pi-ban`),
     * у своей — удаляет её (`pi-trash`). Решение всё равно принимает сервер,
     * интерфейс лишь выбирает правильные слова.
     */
    generated: boolean;
    /** Идёт запрос по строке: повторное нажатие не проходит. */
    pending?: boolean;
  }>(),
  { pending: false },
);

const emit = defineEmits<{ edit: []; delete: []; move: [] }>();

const { t } = useI18n();

const expanded = ref(false);

/** Кнопка «⋯»: на неё возвращается фокус после закрытия и с неё начинается обход. */
const trigger = ref<HTMLButtonElement | null>(null);

/** Раскрытая стопка: по ней проверяем «клик внутри» при закрытии по клику вне. */
const stack = ref<HTMLElement | null>(null);

/**
 * Раскрытие и сворачивание.
 *
 * `aria-expanded` обязан отражать настоящее состояние: тултипы и `aria-label`
 * дублируют друг друга осознанно, чтобы смысл кнопки не терялся без наведения.
 */
const toggle = () => {
  expanded.value = !expanded.value;
};

const close = () => {
  expanded.value = false;
};

/** Закрыть и вернуть фокус на «⋯»: так ведёт себя Escape. */
const closeAndFocus = () => {
  close();
  trigger.value?.focus();
};

/** «Изменить задачу» — одна строка и для тултипа, и для `aria-label`. */
const editLabel = computed(() => t('plan.editHint'));

/**
 * Текст удаления берётся тот же, что у подтверждения в окне: у отказа — «Больше
 * не предлагать», у своего дела — «Удалить». Двух источников смысла нет: тултип
 * и `aria-label` всегда говорят одно и то же.
 */
const deleteLabel = computed(() => (props.generated ? t('plan.forgetConfirm') : t('plan.deleteConfirm')));

const deleteIcon = computed(() => (props.generated ? 'pi-ban' : 'pi-trash'));

/** «Перенести на другой день» — перенос всей серии, а не одной отметки. */
const moveLabel = computed(() => t('plan.moveHint'));

/**
 * Действия в порядке сверху вниз: удаление стоит выше всех — дальше от места
 * нажатия, — а «Изменить» прижато к триггеру как основное действие. «Перенести»
 * в середине: это изменение расписания, но не удаление.
 *
 * Разметка идёт в этом же порядке, поэтому Tab идёт от «⋯» вверх по стопке, а
 * задержка появления считается от конца списка: снизу вверх, как она и растёт.
 */
const actions = computed(() => [
  { key: 'delete', icon: deleteIcon.value, label: deleteLabel.value, danger: true, delay: 2 },
  { key: 'move', icon: 'pi-calendar-plus', label: moveLabel.value, danger: false, delay: 1 },
  { key: 'edit', icon: 'pi-pencil', label: editLabel.value, danger: false, delay: 0 },
] as const);

/** Выбрали «Изменить»: стопка сворачивается, окно открывает страница. */
const chooseEdit = () => {
  close();
  emit('edit');
};

/** Выбрали удаление или отказ: дальше — окно подтверждения со своим текстом. */
const chooseDelete = () => {
  close();
  emit('delete');
};

/** Выбрали перенос: страница откроет календарь. */
const chooseMove = () => {
  close();
  emit('move');
};

const choose = (key: 'edit' | 'move' | 'delete') => {
  if (key === 'edit') chooseEdit();
  else if (key === 'move') chooseMove();
  else chooseDelete();
};

/**
 * Escape закрывает стопку и возвращает фокус на «⋯».
 *
 * Слушаем на `document` в фазе перехвата: иначе Escape достался бы шторкам,
 * которые могут быть открыты поверх страницы, и закрыл бы сразу два слоя.
 */
const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !expanded.value) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  closeAndFocus();
};

/**
 * Закрытие по клику вне стопки: внутри — не закрываем, иначе кнопка действия
 * исчезла бы из-под пальца до того, как случится нажатие.
 */
const onPointerDown = (event: PointerEvent) => {
  const target = event.target as Node | null;

  if (!expanded.value || !target) {
    return;
  }

  if (trigger.value?.contains(target) || stack.value?.contains(target)) {
    return;
  }

  close();
};

/**
 * Прокрутка и изменение размера окна: стопка привязана к своей строке, поэтому
 * при сдвиге страницы она закрывается, а не «уезжает» от кнопки.
 */
const onScroll = () => close();
const onResize = () => close();

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onResize);
});

/**
 * Строка ушла из плана (её удаляют) — раскрытая стопка не должна остаться на
 * пустом месте. Страница сообщает об этом флагом `pending`, а не отдельным
 * событием: открытое окно удаления и так перекрывает список.
 */
watch(
  () => props.pending,
  (pending) => {
    if (pending) {
      close();
    }
  },
);
</script>

<template>
  <div class="plan-actions" :class="{ 'plan-actions--open': expanded }">
    <!--
      Стопка кружков существует, только пока раскрыта.
      
      Раньше кнопки лежали в разметке всегда и прятались стилями — так их видел
      серверный HTML, но браузер отказывался вести на них Tab (кружок с
      `tabindex` 0 внутри скрытой стопки оставался вне порядка обхода). Теперь
      скрытое состояние — это отсутствие узлов: обход клавиатурой идёт ровно по
      тому, что видно, а `v-if` не мешает анимации появления: узлы создаются
      вместе с классом `--open`, и `animation` стартует в том же кадре.
    -->
    <div v-if="expanded" ref="stack" class="plan-actions__stack">
      <div v-for="action in actions" :key="action.key" class="plan-actions__item">
        <button
          type="button"
          class="plan-actions__chip"
          :class="action.danger ? 'plan-actions__chip--danger' : 'plan-actions__chip--accent'"
          :aria-label="action.label"
          :disabled="pending"
          :style="{ animationDelay: `calc(${action.delay} * 70ms)` }"
          @click="choose(action.key)"
        >
          <i class="pi" :class="action.icon" aria-hidden="true" />

          <!--
            Тултип: текст обязателен и при наведении, и при фокусе с клавиатуры
            (на тач-устройствах наведения нет — там работает `aria-label`).
          -->
          <span class="plan-actions__tip" role="tooltip">{{ action.label }}</span>
        </button>
      </div>
    </div>

    <!-- Триггер: тот же «⋯», что и раньше, но теперь раскрывает стопку -->
    <button
      ref="trigger"
      type="button"
      class="plan-actions__trigger"
      :aria-label="t('plan.actions')"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <i class="pi pi-ellipsis-h" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
/*
 * Действия у строки плана: «⋯» и раскрывающаяся вверх стопка кружков.
 *
 * Компонент занимает ровно место кнопки-триггера, а стопка живёт абсолютно над
 * ней: раскрытие не сдвигает ни строку, ни список. Пока стопка закрыта, она
 * невидима и не перехватывает нажатия, но её разметка остаётся в DOM.
 */
.plan-actions {
  position: relative;
  display: flex;
  align-items: center;
}

.plan-actions__trigger {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  flex: 0 0 var(--tap-min);
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text-muted);
  cursor: pointer;
  transition:
    background-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.plan-actions__trigger:hover {
  background: var(--c-surface-sunken);
  color: var(--c-text);
}

.plan-actions--open .plan-actions__trigger {
  background: var(--c-surface-sunken);
  color: var(--c-text);
}

.plan-actions--open {
  /* Раскрытая стопка выходит за строку: она обязана быть выше соседних строк */
  z-index: 5;
}

/* Стопка живёт над триггером: раскрытие не сдвигает ни строку, ни список */
.plan-actions__stack {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--space-2));
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/*
 * Кружок действия. Размер — минимальная зона нажатия, поэтому по нему нельзя
 * промахнуться; скругление и тени — на токенах. Прозрачность в ноль — стартовое
 * состояние анимации появления.
 */
.plan-actions__chip {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  border: none;
  border-radius: var(--r-pill);
  font: inherit;
  cursor: pointer;
  opacity: 0;
}

.plan-actions__chip--accent {
  background: var(--c-accent);
  color: var(--c-text-on-accent);
  box-shadow: var(--shadow-fab);
}

.plan-actions__chip--danger {
  background: var(--c-danger);
  color: var(--c-text-on-accent);
  box-shadow: var(--shadow-fab);
}

.plan-actions__chip:hover:not(:disabled) {
  filter: brightness(1.05);
}

.plan-actions__chip:disabled {
  opacity: 0.5;
  cursor: default;
}

/*
 * Появление: кружок выезжает из триггера вверх, подрастая и проявляясь.
 * Задержка приходит из разметки, поэтому стопка раскрывается снизу вверх, а не
 * вспыхивает целиком: сначала ближний к триггеру кружок, затем верхний.
 */
.plan-actions__chip {
  animation: plan-chip-grow var(--dur-base) var(--ease-out) both;
}

@keyframes plan-chip-grow {
  from {
    opacity: 0;
    transform: translateY(28px) scale(0.4);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/*
 * Тултип: слева от кружка (стопка стоит у правого края строки, поэтому текст
 * уходит внутрь карточки). Появляется с задержкой по наведению и по фокусу —
 * и только там, где наведение существует: на тач-устройствах он не нужен.
 */
.plan-actions__tip {
  position: absolute;
  top: 50%;
  right: calc(100% + var(--space-2));
  max-width: 30ch;
  padding: 6px var(--space-3);
  border-radius: var(--r-chip);
  background: var(--c-text);
  color: var(--c-bg);
  box-shadow: var(--shadow-lift);
  font-size: var(--fs-caption);
  font-weight: 600;
  line-height: var(--lh-tight);
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(-50%) translateX(6px);
  transition:
    opacity var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-out),
    visibility var(--dur-fast) var(--ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .plan-actions__chip:hover .plan-actions__tip {
    opacity: 1;
    visibility: visible;
    transform: translateY(-50%) translateX(0);
    transition-delay: 120ms;
  }
}

.plan-actions__chip:focus-visible .plan-actions__tip {
  opacity: 1;
  visibility: visible;
  transform: translateY(-50%) translateX(0);
  transition-delay: 120ms;
}

/* Обводка фокуса обязана быть видна на цветном кружке */
.plan-actions__chip:focus-visible {
  outline: 2px solid var(--c-text);
  outline-offset: 2px;
}

/*
 * Кто просил меньше движения — получает стопку без роста и без задержек:
 * кнопки просто становятся видимыми.
 */
@media (prefers-reduced-motion: reduce) {
  .plan-actions__chip {
    animation: none;
    opacity: 1;
  }

  .plan-actions__tip,
  .plan-actions__trigger {
    transition: none;
  }
}
</style>
