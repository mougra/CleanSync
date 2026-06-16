<template>
  <div class="login">
    <h2 class="text-2xl font-bold text-center mb-6">Вход</h2>
    <form @submit.prevent="handleLogin" class="flex flex-column gap-3">
      <div class="flex flex-column gap-2">
        <label for="email" class="font-semibold">Email</label>
        <InputText id="email" v-model="email" type="email" placeholder="email@example.com" required />
      </div>
      <div class="flex flex-column gap-2">
        <label for="password" class="font-semibold">Пароль</label>
        <Password id="password" v-model="password" :feedback="false" toggleMask />
      </div>
      <Button type="submit" label="Войти" severity="primary" class="mt-2" />
      <p v-if="error" class="error text-red-500 text-center">{{ error }}</p>
    </form>
    <div class="text-center mt-6 flex flex-column gap-2">
      <p>
        Нет аккаунта? <router-link to="/register" class="text-primary-500 font-bold">Зарегистрироваться</router-link>
      </p>
      <p>
        <router-link to="/forgot-password" class="text-primary-500">Забыли пароль?</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';

const router = useRouter();
const email = ref('');
const password = ref('');
const error = ref<string | null>(null);

const handleLogin = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value })
    });

    const data = await response.json();

    if (!response.ok) {
      error.value = data.error || 'Ошибка входа';
      return;
    }

    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);

    router.push('/schedules');
  } catch (err) {
    error.value = 'Ошибка подключения к серверу';
  }
};
</script>

<style scoped>
.login {
  max-width: 400px;
  margin: 50px auto;
  padding: 2rem;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  background: white;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}
</style>
