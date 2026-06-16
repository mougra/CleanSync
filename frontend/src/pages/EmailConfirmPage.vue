<template>
  <div class="confirm-email text-center p-8 max-w-md mx-auto mt-10 border-round shadow-1 bg-white">
    <h2 class="text-2xl font-bold mb-4">Подтверждение email</h2>
    <p v-if="status === 'loading'" class="text-gray-600">Проверка...</p>
    <p v-if="status === 'success'" class="text-green-500 font-semibold mb-4">Email подтверждён. Теперь вы можете войти.</p>
    <p v-if="status === 'error'" class="text-red-500 mb-4">{{ error }}</p>
    <Button v-if="status === 'success'" label="Перейти на вход" as="router-link" to="/login" severity="primary" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';

const route = useRoute();
const status = ref<'loading' | 'success' | 'error'>('loading');
const error = ref<string | null>(null);

onMounted(async () => {
  const token = route.query.token as string | null;
  if (!token) {
    error.value = 'Токен отсутствует';
    status.value = 'error';
    return;
  }

  try {
    const response = await fetch('http://localhost:5000/api/auth/confirm-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await response.json();
    if (!response.ok) {
      error.value = data.error || 'Ошибка подтверждения email';
      status.value = 'error';
      return;
    }

    status.value = 'success';
  } catch (err) {
    error.value = 'Ошибка подключения к серверу';
    status.value = 'error';
  }
});
</script>

<style scoped>
.confirm-email {
  max-width: 500px;
  margin: 50px auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
}
</style>
