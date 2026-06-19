<template>
  <div class="schedules p-4 max-w-screen-xl mx-auto">
    <div class="flex justify-content-between align-items-center mb-6">
      <h2 class="text-3xl font-bold">Мои графики уборки</h2>
      <div class="flex gap-2">
        <Button label="Профиль" icon="pi pi-user" text @click="goProfile" />
        <Button label="+ Новый график" icon="pi pi-plus" severity="success" @click="showNewScheduleForm = true" />
        <Button label="Выход" icon="pi pi-sign-out" severity="danger" text @click="handleLogout" />
      </div>
    </div>

    <Dialog v-model:visible="showNewScheduleForm" modal header="Новый график" :style="{ width: '450px' }">
      <div class="flex flex-column gap-3">
        <div class="flex flex-column gap-2">
          <label for="title" class="font-semibold">Название</label>
          <InputText id="title" v-model="newSchedule.title" placeholder="Название" autofocus />
        </div>
        <div class="flex flex-column gap-2">
          <label for="desc" class="font-semibold">Описание</label>
          <Textarea id="desc" v-model="newSchedule.description" rows="3" placeholder="Описание" />
        </div>
        <div class="flex justify-content-end gap-2 mt-3">
          <Button label="Отмена" severity="secondary" text @click="showNewScheduleForm = false" />
          <Button label="Создать" @click="createSchedule" />
        </div>
      </div>
    </Dialog>

    <div v-if="isLoading" class="flex justify-content-center align-items-center py-8">
      <ProgressSpinner />
    </div>

    <div v-else-if="schedules?.length > 0" class="grid">
      <div v-for="schedule in schedules" :key="schedule.id" class="col-12 md:col-4 lg:col-3 p-3">
        <Card class="h-full shadow-2">
          <template #title>
            <div class="text-xl font-bold">{{ schedule.title }}</div>
          </template>
          <template #content>
            <p v-if="schedule.description" class="text-gray-600 mb-4">{{ schedule.description }}</p>
          </template>
          <template #footer>
            <div class="flex gap-2">
              <Button as="router-link" :to="`/schedule/${schedule.id}`" label="Просмотр" icon="pi pi-eye" size="small" class="flex-1" />
              <Button icon="pi pi-trash" severity="danger" text size="small" @click="deleteSchedule(schedule.id)" />
            </div>
          </template>
        </Card>
      </div>
    </div>

    <div v-else class="text-center py-8 text-gray-500">
      <i class="pi pi-calendar-minus text-5xl mb-3 block"></i>
      <p>Нет графиков. Создайте новый!</p>
    </div>

    <div v-if="error" class="p-4 mt-4 bg-red-100 text-red-700 border-round">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { useHead } from '@unhead/vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import type { Schedule } from '../../../shared/types';

import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Card from 'primevue/card';
import ProgressSpinner from 'primevue/progressspinner';

const router = useRouter();
const authStore = useAuthStore();
const queryClient = useQueryClient();

// SEO
useHead({
  title: 'Мои графики — CleanPlanner',
  meta: [
    { name: 'description', content: 'Управляйте своими графиками уборки в CleanPlanner' },
  ],
});

const showNewScheduleForm = ref(false);
const newSchedule = reactive({
  title: '',
  description: ''
});

// Fetch Schedules
const { data: schedules, isLoading, error } = useQuery<{ schedules: Schedule[] }>({
  queryKey: ['schedules'],
  queryFn: async (): Promise<Schedule[]> => {
    const res = await fetch('http://localhost:5000/api/schedules', {
      headers: { 'Authorization': `Bearer ${authStore.getToken()}` }
    });
    if (res.status === 401) {
      router.push('/login');
      throw new Error('Unauthorized');
    }
    if (!res.ok) throw new Error('Ошибка загрузки');
    return res.json();
  }
});

// Create Schedule
const createMutation = useMutation({
  mutationFn: async (data: { title: string, description: string | null }) => {
    const res = await fetch('http://localhost:5000/api/schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.getToken()}`
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Ошибка создания');
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['schedules'] });
    showNewScheduleForm.value = false;
    newSchedule.title = '';
    newSchedule.description = '';
  }
});

const createSchedule = () => {
  createMutation.mutate(newSchedule);
};

// Delete Schedule
const deleteMutation = useMutation({
  mutationFn: async (id: string) => {
    const res = await fetch(`http://localhost:5000/api/schedules/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authStore.getToken()}` }
    });
    if (!res.ok) throw new Error('Ошибка удаления');
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['schedules'] });
  }
});

const deleteSchedule = (id: string) => {
  if (confirm('Удалить график?')) {
    deleteMutation.mutate(id);
  }
};

const goProfile = () => router.push('/profile');
const handleLogout = () => {
  authStore.logout();
  router.push('/login');
};
</script>

<style scoped>
.text-gray-600 { color: #4b5563; }
.text-gray-500 { color: #6b7280; }
</style>
