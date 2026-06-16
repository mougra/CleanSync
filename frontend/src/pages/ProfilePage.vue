<template>
  <div class="profile-page p-4 max-w-2xl mx-auto">
    <h2 class="text-3xl font-bold mb-6">Профиль</h2>

    <div class="profile-card flex align-items-center gap-4 mb-8 p-4 border-round bg-white shadow-1">
      <img :src="user.avatar_url || defaultAvatar" alt="avatar" class="w-20 h-20 border-round-circle border-1" />
      <div class="profile-info">
        <p class="text-lg"><strong class="text-gray-600">Email:</strong> {{ user.email }}</p>
        <p>
          <strong class="text-gray-600">Статус:</strong>
          <Tag :value="user.is_email_confirmed ? 'Подтверждён' : 'Не подтверждён'" :severity="user.is_email_confirmed ? 'success' : 'warning'" />
        </p>
        <Button v-if="!user.is_email_confirmed" label="Отправить подтверждение" icon="pi pi-send" severity="warning" text size="small" @click="resendConfirmation" class="mt-2" />
      </div>
    </div>

    <Card class="mb-6 shadow-1">
      <template #title>
        <div class="text-xl font-bold">Личные данные</div>
      </template>
      <template #content>
        <form @submit.prevent="updateProfile" class="flex flex-column gap-4">
          <div class="flex flex-column gap-2">
            <label for="username" class="font-semibold">Никнейм</label>
            <InputText id="username" v-model="form.username" required />
          </div>
          <div class="flex flex-column gap-2">
            <label for="avatarUrl" class="font-semibold">Avatar URL</label>
            <InputText id="avatarUrl" v-model="form.avatarUrl" placeholder="https://..." />
          </div>
          <Button label="Сохранить профиль" type="submit" severity="primary" />
          <p v-if="message" class="text-green-500">{{ message }}</p>
          <p v-if="error" class="text-red-500">{{ error }}</p>
        </form>
      </template>
    </Card>

    <Card class="shadow-1">
      <template #title>
        <div class="text-xl font-bold">Безопасность</div>
      </template>
      <template #content>
        <form @submit.prevent="changePassword" class="flex flex-column gap-4">
          <div class="flex flex-column gap-2">
            <label for="currentPassword" class="font-semibold">Текущий пароль</label>
            <Password id="currentPassword" v-model="passwordForm.currentPassword" :feedback="false" toggleMask required />
          </div>
          <div class="flex flex-column gap-2">
            <label for="newPassword" class="font-semibold">Новый пароль</label>
            <Password id="newPassword" v-model="passwordForm.newPassword" :feedback="false" toggleMask required />
          </div>
          <div class="flex flex-column gap-2">
            <label for="confirmPassword" class="font-semibold">Подтвердите новый пароль</label>
            <Password id="confirmPassword" v-model="passwordForm.confirmPassword" :feedback="false" toggleMask required />
          </div>
          <Button label="Изменить пароль" type="submit" severity="danger" />
          <p v-if="message" class="text-green-500">{{ message }}</p>
          <p v-if="error" class="text-red-500">{{ error }}</p>
        </form>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import type { User } from '../../../shared/types';

const router = useRouter();
const user = ref<User>({} as User);
const form = reactive({
  username: '',
  avatarUrl: ''
});
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
});
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const defaultAvatar = 'https://ui-avatars.com/api/?name=User&background=random&color=fff';

const loadProfile = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/auth/me', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`
      }
    });

    if (!response.ok) {
      router.push('/login');
      return;
    }

    const data = await response.json();
    user.value = data;
    form.username = data.username || '';
    form.avatarUrl = data.avatar_url || '';
  } catch (err) {
    error.value = 'Не удалось загрузить профиль';
  }
};

const updateProfile = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify(form)
    });

    const data = await response.json();
    if (!response.ok) {
      error.value = data.error || 'Ошибка сохранения профиля';
      return;
    }

    user.value = data;
    message.value = 'Профиль сохранён';
    error.value = null;
  } catch (err) {
    error.value = 'Ошибка подключения';
  }
};

const resendConfirmation = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/auth/resend-confirmation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: user.value.email })
    });

    const data = await response.json();
    if (!response.ok) {
      error.value = data.error || 'Ошибка отправки подтверждения';
      return;
    }

    message.value = 'Письмо с подтверждением отправлено повторно.';
    error.value = null;
  } catch (err) {
    error.value = 'Ошибка подключения';
  }
};

const changePassword = async () => {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    error.value = 'Пароли не совпадают';
    return;
  }

  try {
    const response = await fetch('http://localhost:5000/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`
      },
      body: JSON.stringify({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      })
    });

    const data = await response.json();
    if (!response.ok) {
      error.value = data.error || 'Ошибка изменения пароля';
      return;
    }

    message.value = data.message;
    error.value = null;
    passwordForm.currentPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
  } catch (err) {
    error.value = 'Ошибка подключения';
  }
};

onMounted(loadProfile);
</script>
