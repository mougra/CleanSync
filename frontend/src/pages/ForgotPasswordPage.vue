<template>
  <div class="forgot-password p-8 max-w-md mx-auto mt-10 border-round shadow-1 bg-white">
    <h2 class="text-2xl font-bold text-center mb-6">Восстановление пароля</h2>
    <form @submit.prevent="handleForgotPassword" class="flex flex-column gap-3">
      <div class="flex flex-column gap-2">
        <label for="email" class="font-semibold">Email</label>
        <InputText id="email" v-model="email" type="email" placeholder="email@example.com" required />
      </div>
      <Button type="submit" label="Отправить ссылку" severity="primary" />
      <p v-if="message" class="text-green-500 text-center">{{ message }}</p>
      <p v-if="error" class="text-red-500 text-center">{{ error }}</p>
    </form>
    <div class="text-center mt-6">
      <p>
        <router-link to="/login" class="text-primary-500 font-bold">Вернуться ко входу</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';

const email = ref('');
const message = ref<string | null>(null);
const error = ref<string | null>(null);

const handleForgotPassword = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value })
    });

    const data = await response.json();

    if (!response.ok) {
      error.value = data.error || 'Ошибка отправки';
      return;
    }

    message.value = data.message;
    error.value = null;
  } catch (err) {
    error.value = 'Ошибка подключения к серверу';
  }
};
</script>

<style scoped>
.forgot-password {
  max-width: 400px;
  margin: 50px auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
}
</style>
