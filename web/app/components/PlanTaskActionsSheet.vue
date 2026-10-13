<script setup lang="ts">
/**
 * Действия со строкой «Плана на сегодня»: правка и удаление в компактном листе.
 *
 * «Изменить» — первое действие и доступно любой задаче. Название и периодичность
 * человек выбирает сам; что именно при этом происходит с задачей, решает
 * страница: сгенерированная заменяется своей, своя обновляется на месте (см.
 * `index.vue`).
 *
 * Текст удаления зависит от источника задачи. Сгенерированную задачу (`source` из
 * `GENERATED_TASK_SOURCES`) человек не создавал — он отказывается от предложения,
 * поэтому кнопка говорит «Больше не предлагать» и рядом стоит короткое пояснение,
 * что при пересборке плана задача не вернётся. Своё дело человек просто удаляет.
 *
 * Отдельная шторка, а не действие по нажатию: строка отмечается одним тапом, и
 * удаление не должно случаться от промаха по ней. Здесь же видно, что именно
 * уйдёт.
 */
const props = defineProps<{
  open: boolean;
  title: string;
  /** `true` — задача собрана сервером, `false` — создана человеком. */
  generated: boolean;
  /** Идёт запрос удаления: кнопки заблокированы. */
  pending?: boolean;
  /** Удаление не прошло: причина остаётся в листе, а не пропадает молча. */
  error?: string;
}>();

const emit = defineEmits<{ close: []; edit: []; confirm: [] }>();

const { t } = useI18n();

/** Заголовок листа: у отказа и удаления он разный — и по смыслу, и по тексту. */
const heading = computed(() => (props.generated ? t('plan.forgetTitle') : t('plan.deleteTitle')));

/** Пояснение под заголовком: только у отказа, у своего удаления оно избыточно. */
const explanation = computed(() => (props.generated ? t('plan.forgetText') : null));
</script>

<template>
  <!--
    Лист не прячется за `v-if`: его разметка (заголовок и кнопка действия) есть в
    серверном HTML, поэтому страница знает про удаление ещё до первого нажатия.
    Пока лист закрыт, `AppSheet` держит его через `v-show` — на экране ничего не
    мигает, а состояние доступности помечено `aria-hidden`.
  -->
  <AppSheet :open="open" @close="emit('close')">
    <template #header>
      <div class="action">
        <span class="action__icon" aria-hidden="true"><i class="pi pi-ellipsis-h" /></span>
        <div class="action__head">
          <h2 class="action__title">{{ heading }}</h2>
          <p class="action__task">{{ title }}</p>
        </div>
      </div>
    </template>

    <!-- Тело нужно не всегда: у своего удаления пояснения нет, и пустая полоса
         над кнопкой только отодвигала бы её от заголовка. -->
    <div v-if="explanation || error" class="action__body">
      <p v-if="explanation" class="action__text">{{ explanation }}</p>

      <p v-if="error" class="action__error" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <!--
        Действия идут столбиком: «Изменить» сверху как основное, удаление — под
        ним. Так промах по строке списка не превращается в удаление, и оба
        действия остаются крупными (высота в палец).
      -->
      <div class="action__footer">
        <button type="button" class="action__edit" :disabled="pending" @click="emit('edit')">
          <i class="pi pi-pencil" aria-hidden="true" />
          {{ t('plan.edit') }}
        </button>

        <!--
          Действие удаления рисуется дважды — текстом отказа и текстом удаления, —
          а лишнее прячет CSS по классу у открытого действия. Так в серверной
          разметке закрытого листа есть оба возможных текста: у гостя и до
          открытия листа задача ещё не выбрана, и одна подпись «Удалить»
          показывала бы отказ от предложения как удаление своего дела.
        -->
        <button
          type="button"
          class="action__confirm"
          :class="{ 'action__confirm--forget': generated }"
          :disabled="pending"
          @click="emit('confirm')"
        >
          <i :class="['pi', generated ? 'pi-ban' : 'pi-trash']" aria-hidden="true" />
          <span class="action__label-forget">{{ t('plan.forgetConfirm') }}</span>
          <span class="action__label-delete">{{ t('plan.deleteConfirm') }}</span>
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

/*
 * Какой из двух текстов удаления виден: у отказа — «Больше не предлагать», у
 * своего дела — «Удалить». Оба лежат в разметке, поэтому показываем ровно один.
 */
.action__label-forget {
  display: none;
}

.action__confirm--forget .action__label-forget {
  display: inline;
}

.action__confirm--forget .action__label-delete {
  display: none;
}

.action__footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/*
 * «Изменить» — не опасное действие: акцентный контур, а не заливка. Красная
 * кнопка рядом с ним остаётся единственной «страшной», и спутать их нельзя.
 */
.action__edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 52px;
  padding: 0 var(--space-5);
  border: 1.5px solid var(--c-accent);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.action__edit:hover:not(:disabled) {
  background: var(--c-accent-soft);
}

.action__edit:disabled {
  opacity: 0.6;
  cursor: default;
}

.action__confirm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 52px;
  padding: 0 var(--space-5);
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-danger);
  color: var(--c-text-on-accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

/*
 * Отказ от предложения — не удаление своего дела: опасного красного здесь нет,
 * задача вернётся по кнопке «Вернуть» и её всегда можно добавить заново.
 */
.action__confirm--forget {
  background: var(--c-surface-sunken);
  color: var(--c-text);
}

.action__confirm:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
