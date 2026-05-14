<template>
  <Dialog header="Вход в Clean Planner" v-model:visible="visible" :modal="true" :style="{ width: '420px' }" closable>
    <div class="auth-tabs">
      <button :class="['tab-btn', mode === 'login' ? 'active' : '']" @click="mode = 'login'">Вход</button>
      <button :class="['tab-btn', mode === 'register' ? 'active' : '']" @click="mode = 'register'">Регистрация</button>
    </div>

    <div class="auth-form">
      <template v-if="mode === 'login'">
        <div class="field">
          <label>Email</label>
          <InputText v-model="loginForm.email" placeholder="user@example.com" />
        </div>
        <div class="field">
          <label>Пароль</label>
          <Password v-model="loginForm.password" toggleMask feedback="false" />
        </div>
        <p-button label="Войти" class="p-button-rounded p-button-primary" @click="submitLogin" />
      </template>

      <template v-else>
        <div class="field">
          <label>Email</label>
          <InputText v-model="registerForm.email" placeholder="user@example.com" />
        </div>
        <div class="field">
          <label>Пароль</label>
          <Password v-model="registerForm.password" toggleMask feedback="false" />
        </div>
        <div class="field">
          <label>Повторите пароль</label>
          <Password v-model="registerForm.confirmPassword" toggleMask feedback="false" />
        </div>
        <p-button label="Зарегистрироваться" class="p-button-rounded p-button-success" @click="submitRegister" />
      </template>

      <div v-if="message" class="auth-message success">{{ message }}</div>
      <div v-if="error" class="auth-message error">{{ error }}</div>
    </div>
  </Dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '../entities/auth/authStore'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'

const auth = useAuthStore()
const props = defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible'])

const visible = computed({
  get: () => auth.isAuthDialogOpen,
  set: (value) => {
    auth.isAuthDialogOpen = value
    emit('update:visible', value)
  }
})

const mode = ref('login')
const loginForm = ref({ email: '', password: '' })
const registerForm = ref({ email: '', password: '', confirmPassword: '' })
const message = ref('')
const error = ref('')

const resetMessages = () => {
  message.value = ''
  error.value = ''
}

const submitLogin = async () => {
  resetMessages()
  try {
    await auth.login(loginForm.value)
    visible.value = false
  } catch (err) {
    error.value = err.message || 'Ошибка сети'
  }
}

const submitRegister = async () => {
  resetMessages()
  if (registerForm.value.password !== registerForm.value.confirmPassword) {
    error.value = 'Пароли не совпадают'
    return
  }

  try {
    await auth.register({ email: registerForm.value.email, password: registerForm.value.password })
    message.value = 'Регистрация прошла успешно. Выполните вход.'
    mode.value = 'login'
    registerForm.value = { email: '', password: '', confirmPassword: '' }
  } catch (err) {
    error.value = err.message || 'Ошибка сети'
  }
}
</script>

<style scoped>
.auth-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  margin-bottom: 1.3rem;
}

.tab-btn {
  border: 1px solid #d9e2ec;
  background: #f8fafc;
  padding: 0.8rem 1rem;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  color: #102a43;
}

.tab-btn.active {
  background: #ff7a59;
  color: #ffffff;
  border-color: transparent;
}

.auth-form {
  display: grid;
  gap: 1rem;
}

.field {
  display: grid;
  gap: 0.5rem;
}

.field label {
  font-size: 0.9rem;
  color: #334e68;
}

.auth-message {
  padding: 0.85rem 1rem;
  border-radius: 10px;
  font-size: 0.9rem;
}

.auth-message.success {
  background: #e6fffa;
  color: #047857;
}

.auth-message.error {
  background: #ffe3e3;
  color: #b91c1c;
}
</style>