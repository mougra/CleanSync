<template>
  <div class="schedule-page p-4 max-w-screen-xl mx-auto">
    <h1 class="page-title text-3xl font-bold mb-6">Планирование уборки</h1>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Form -->
      <Card class="shadow-1">
        <template #title>
          <div class="text-xl font-bold">Добавить новую задачу</div>
        </template>
        <template #content>
          <form @submit.prevent="handleAddTask" class="flex flex-column gap-4">
            <div class="flex flex-column gap-2">
              <label for="title" class="font-semibold text-gray-600">Название задачи</label>
              <InputText id="title" v-model="newTask.title" placeholder="Например: Уборка кухни" required />
            </div>

            <div class="flex flex-column gap-2">
              <label for="category" class="font-semibold text-gray-600">Категория</label>
              <Dropdown v-model="newTask.category" :options="categories" required />
            </div>

            <div class="flex flex-column gap-2">
              <label for="date" class="font-semibold text-gray-600">Дата</label>
              <DatePicker id="date" v-model="newTask.date" required />
            </div>

            <div class="flex flex-column gap-2">
              <label for="time" class="font-semibold text-gray-600">Время</label>
              <InputText id="time" v-model="newTask.time" type="time" required />
            </div>

            <div class="flex flex-column gap-2">
              <label for="priority" class="font-semibold text-gray-600">Приоритет</label>
              <Dropdown v-model="newTask.priority" :options="priorities" />
            </div>

            <div class="flex flex-column gap-2">
              <label for="description" class="font-semibold text-gray-600">Описание</label>
              <Textarea id="description" v-model="newTask.description" placeholder="Добавьте детали..." rows="3" />
            </div>

            <Button type="submit" label="Добавить задачу" severity="primary" class="w-full mt-2" />
          </form>
        </template>
      </Card>

      <!-- Task List -->
      <Card class="shadow-1">
        <template #title>
          <div class="text-xl font-bold">Все задачи ({{ tasks.length }})</div>
        </template>
        <template #content>
          <div class="task-list-wrapper mt-4">
            <div v-if="tasks.length > 0" class="flex flex-column gap-3">
              <TaskItem
                v-for="task in sortedTasks"
                :key="task.id"
                :task="task"
                @toggle="$emit('toggle-task', task.id)"
                @delete="$emit('delete-task', task.id)"
              />
            </div>
            <div v-else class="text-center py-8 text-gray-500">
              <p>Нет задач</p>
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import TaskItem from '../components/TaskItem.vue'
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import DatePicker from 'primevue/datepicker';
import Textarea from 'primevue/textarea';
import Card from 'primevue/card';
import type { Task } from '../../../shared/types';

const props = defineProps<{
  tasks: Task[];
}>();

const emit = defineEmits<{
  (e: 'add-task', task: any): void;
  (e: 'toggle-task', id: string): void;
  (e: 'delete-task', id: string): void;
}>();

const categories = ['Кухня', 'Ванная', 'Спальня', 'Гостиная', 'Коридор', 'Балкон', 'Другое'];
const priorities = ['Низкий', 'Средний', 'Высокий'];

const newTask = ref({
  title: '',
  category: 'Кухня',
  date: new Date().toISOString().split('T')[0],
  time: '10:00',
  priority: 'Средний',
  description: ''
});

const handleAddTask = () => {
  if (newTask.value.title.trim()) {
    emit('add-task', { ...newTask.value });
    resetForm();
  }
};

const resetForm = () => {
  newTask.value = {
    title: '',
    category: 'Кухня',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    priority: 'Средний',
    description: ''
  };
};

const sortedTasks = computed(() =>
  [...props.tasks].sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime())
);
</script>

<style scoped>
.schedule-page {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-title {
  color: #26d07c;
}
</style>
