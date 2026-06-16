<template>
  <div class="register">
    <h2 class="text-2xl font-bold text-center mb-6">Регистрация</h2>
    <form @submit.prevent="handleRegister" class="flex flex-column gap-3">
      <div class="flex flex-column gap-2">
        <label for="email" class="font-semibold">Email</label>
        <InputText id="email" v-model="email" type="email" placeholder="email@example.com" required />
        <p class="hint text-sm text-gray-500 mt-1">Можно использовать любой рабочий email — Gmail, Яндекс, Mail.ru и т.д.</p>
      </div>
      <div class="flex flex-column gap-2">
        <label for="password" class="font-semibold">Пароль</label>
        <Password id="password" v-model="password" :feedback="false" toggleMask required />
      </div>
      <div class="flex flex-column gap-2">
        <label for="confirmPassword" class="font-semibold">Повторите пароль</label>
        <Password id="confirmPassword" v-model="confirmPassword" :feedback="false" toggleMask required />
      </div>
      <Button type="submit" label="Зарегистрироваться" severity="success" class="mt-2" />
      <p v-if="message" class="message text-green-500 text-center">{{ message }}</p>
      <p v-if="error" class="error text-red-500 text-center">{{ error }}</p>
    </form>
    <div class="text-center mt-6">
      <p>
        Уже есть аккаунт? <router-link to="/login" class="text-primary-500 font-bold">Войти</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';

const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref<string | null>(null);
const message = ref<string | null>(null);

const handleRegister = async () => {
  message.value = null;
  if (password.value !== confirmPassword.value) {
    error.value = 'Пароли не совпадают';
    return;
  }

  try {
    const response = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value })
    });

    const data = await response.json();

    if (!response.ok) {
      error.value = data.error || 'Ошибка регистрации';
      return;
    }

    message.value = data.message || 'Регистрация успешна. Пожалуйста, подтвердите email для входа.';
    error.value = null;
    email.value = '';
    password.value = '';
    confirmPassword.value = '';
  } catch (err) {
    error.value = 'Ошибка подключения к серверу';
  }
};
</script>

<style scoped>
.register {
  max-width: 400px;
  margin: 50px auto;
  padding: 2rem;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  background: white;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}
</style>
