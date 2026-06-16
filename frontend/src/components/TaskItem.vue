<template>
  <Card :class="{ 'opacity-60': task.completed }" class="task-item shadow-1">
    <template #content>
      <div class="flex justify-content-between align-items-center">
        <div class="task-info flex-1">
          <div class="task-title text-lg font-semibold mb-2" :class="{ 'line-through text-400': task.completed }">
            {{ task.title }}
          </div>
          <div class="task-meta flex gap-3 text-sm text-400">
            <span>📅 {{ formatDate(task.date) }}</span>
            <Tag :value="task.category" severity="success" />
            <span>⏱️ {{ task.time }}</span>
          </div>
        </div>
        <div class="task-actions flex gap-2 ml-3">
          <Button
            :icon="task.completed ? 'pi pi-undo' : 'pi pi-check'"
            @click="$emit('toggle')"
            :label="task.completed ? 'Отменить' : 'Готово'"
            severity="secondary"
            text
            size="small"
            :title="task.completed ? 'Отметить как незавершено' : 'Отметить как завершено'"
          />
          <Button
            icon="pi pi-trash"
            @click="$emit('delete')"
            severity="danger"
            text
            size="small"
            title="Удалить"
          />
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import Card from 'primevue/card';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import type { Task } from '../../../shared/types';

defineProps<{
  task: Task;
}>();

defineEmits<{
  (e: 'toggle'): void;
  (e: 'delete'): void;
}>();

const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('ru-RU', options);
};
</script>

<style scoped>
.task-item {
  transition: all 0.3s ease;
  border: 1px solid transparent;
}

.task-item:hover {
  border-color: var(--p-primary-color);
}

.opacity-60 {
  opacity: 0.6;
}
</style>
