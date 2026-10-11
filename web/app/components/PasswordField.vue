<script setup lang="ts">
/**
 * Поле пароля дизайн-системы: подпись, кнопка-глазик внутри поля и сообщение
 * об ошибке под ним.
 *
 * Зачем отдельный компонент: пароль вводится на пяти экранах (вход, регистрация,
 * смена пароля, подтверждение и удаление аккаунта), и везде нужен один и тот же
 * способ показать введённое — иначе легко получить пять разных реализаций,
 * из которых четыре забывают про `autocomplete` и доступность с клавиатуры.
 *
 * Токены — только из `assets/css/tokens.css`: цвета и размеры берутся оттуда,
 * чтобы поле не разъезжалось с остальной дизайн-системой в тёмной теме.
 */
import { useId } from 'vue';

/**
 * Название кнопки-глазика — единственный текст самого компонента, и он из i18n;
 * подпись поля приходит от родителя (какие слова уместны на экране, решает экран).
 */
const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    /** Подпись поля; пустая строка — поле без видимой подписи. */
    label?: string;
    /** Значение `autocomplete`: `current-password` или `new-password`. */
    autocomplete?: 'current-password' | 'new-password' | 'off';
    /** Минимальная длина: уходит и в атрибут `minlength`, и в проверку ввода. */
    minlength?: number;
    /** Подсказка под полем: требования к паролю и прочее. */
    hint?: string;
    /** Текст ошибки; он же включает `aria-invalid` и `role="alert"`. */
    error?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    /** Ставить курсор в поле, когда оно появляется (шаг мастера, раскрытая строка). */
    autofocus?: boolean;
  }>(),
  {
    label: '',
    autocomplete: 'current-password',
    minlength: undefined,
    hint: '',
    error: '',
    placeholder: '',
    required: false,
    disabled: false,
    autofocus: false,
  },
);

const model = defineModel<string>({ default: '' });

const emit = defineEmits<{
  /** Поле получило фокус — родителю это нужно, чтобы не пугать ошибкой заранее. */
  focus: [];
  /** Ввод подтверждён клавишей Enter или отправкой формы. */
  submit: [];
}>();

const baseId = useId();
const inputId = `${baseId}-input`;
const errorId = `${baseId}-error`;
const hintId = `${baseId}-hint`;

const visible = ref(false);
const input = ref<HTMLInputElement | null>(null);

/** Подсказка и ошибка описывают поле: скринридер прочитает их вместе с ним. */
const describedBy = computed(() => {
  const ids = [props.error ? errorId : null, props.hint ? hintId : null].filter(Boolean);

  return ids.length ? ids.join(' ') : undefined;
});

const toggleLabel = computed(() => (visible.value ? t('auth.hidePassword') : t('auth.showPassword')));

const toggle = () => {
  visible.value = !visible.value;

  // Фокус остаётся в поле: иначе после переключения с клавиатуры он уезжает
  // на кнопку и следующая буква попадает уже не в пароль.
  input.value?.focus();
};

const focus = () => input.value?.focus();

defineExpose({ focus });

// Поле показывается только тогда, когда появилось на экране (шаг мастера или
// раскрытая строка настроек), поэтому автофокус срабатывает в нужный момент.
watch(visible, (isVisible) => {
  if (props.autofocus && isVisible) {
    input.value?.focus();
  }
});

onMounted(() => {
  if (props.autofocus) {
    input.value?.focus();
  }
});
</script>

<template>
  <div class="password-field">
    <label v-if="label" class="password-field__label" :for="inputId">{{ label }}</label>

    <div class="password-field__box">
      <input
        :id="inputId"
        ref="input"
        v-model="model"
        class="password-field__input"
        :class="{ 'password-field__input--error': Boolean(error) }"
        :type="visible ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :minlength="minlength"
        :placeholder="placeholder || undefined"
        :required="required"
        :disabled="disabled"
        :aria-invalid="Boolean(error)"
        :aria-describedby="describedBy"
        @focus="emit('focus')"
        @keyup.enter="emit('submit')"
      >

      <button
        type="button"
        class="password-field__toggle"
        :aria-label="toggleLabel"
        :aria-pressed="visible"
        :aria-controls="inputId"
        :title="toggleLabel"
        :disabled="disabled"
        @click="toggle"
      >
        <i :class="['pi', visible ? 'pi-eye-slash' : 'pi-eye']" aria-hidden="true" />
      </button>
    </div>

    <p v-if="error" :id="errorId" class="password-field__error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="password-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.password-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.password-field__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.password-field__box {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.password-field__input {
  width: 100%;
  min-height: 52px;
  /* Справа оставляем место кнопке-глазику, чтобы текст не заезжал под неё */
  padding: 0 calc(var(--tap-min) + var(--space-3)) 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
}

.password-field__input:focus-visible {
  outline: 2px solid var(--c-brand);
  outline-offset: 1px;
}

.password-field__input--error {
  border-color: var(--c-danger);
}

.password-field__toggle {
  position: absolute;
  top: 50%;
  right: var(--space-1);
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  padding: 0;
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text-muted);
  font-size: 1rem;
  cursor: pointer;
}

.password-field__toggle:hover {
  color: var(--c-brand);
}

.password-field__toggle:disabled {
  opacity: 0.6;
  cursor: default;
}

.password-field__hint {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.password-field__error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}
</style>
