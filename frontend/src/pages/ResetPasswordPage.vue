<template>
  <div class="reset-password p-8 max-w-md mx-auto mt-10 border-round shadow-1 bg-white">
    <h2 class="text-2xl font-bold text-center mb-6">Сброс пароля</h2>
    <form @submit.prevent="handleResetPassword" class="flex flex-column gap-3">
      <div class="flex flex-column gap-2">
        <label for="newPassword" class="font-semibold">Новый пароль</label>
        <Password id="newPassword" v-model="newPassword" :feedback="false" toggleMask required />
      </div>
      <div class="flex flex-column gap-2">
        <label for="confirmPassword" class="font-semibold">Подтвердите пароль</label>
        <Password id="confirmPassword" v-model="confirmPassword" :feedback="false" toggleMask required />
      </div>
      <Button type="submit" label="Сбросить пароль" severity="primary" />
      <p v-if="error" class="text-red-500 text-center">{{ error }}</p>
      <p v-if="message" class="text-green-500 text-center">{{ message }}</p>
    </form>
    <div class="text-center mt-6">
      <p>
        <router-link to="/login" class="text-primary-500 font-bold">Вернуться ко входу</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Password from 'primevue/password';

const route = useRoute();
const router = useRouter();
const newPassword = ref('');
const confirmPassword = ref('');
const token = ref<string | null>(null);
const error = ref<string | null>(null);
const message = ref<string | null>(null);

onMounted(() => {
  token.value = route.query.token as string | null;
  if (!token.value) {
    error.value = 'Токен сброса отсутствует';
  }
});

const handleResetPassword = async () => {
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Пароли не совпадают';
    return;
  }

  try {
    const response = await fetch('http://localhost:5000/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.value, newPassword: newPassword.value })
    });

    const data = await response.json();

    if (!response.ok) {
      error.value = data.error || 'Ошибка сброса пароля';
      return;
    }

    message.value = data.message;
    error.value = null;

    setTimeout(() => {
      router.push('/login');
    }, 2000);
  } catch (err) {
    error.value = 'Ошибка подключения к серверу';
  }
};
</script>

<style scoped>
.reset-password {
  max-width: 400px;
  margin: 50px auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
}
</style>
