<template>
  <div class="task-item" :class="{ completed: task.completed }">
    <div class="task-info">
      <div class="task-title" :class="{ completed: task.completed }">
        {{ task.title }}
      </div>
      <div class="task-meta">
        <span>📅 {{ formatDate(task.date) }}</span>
        <span class="task-badge">{{ task.category }}</span>
        <span>⏱️ {{ task.time }}</span>
      </div>
    </div>
    <div class="task-actions">
      <button class="btn-action" @click="$emit('toggle')" :title="task.completed ? 'Отметить как незавершено' : 'Отметить как завершено'">
        {{ task.completed ? '↩️' : '✓' }}
      </button>
      <button class="btn-action delete" @click="$emit('delete')" title="Удалить">
        🗑️
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  task: Object
})

defineEmits(['toggle', 'delete'])

const formatDate = (dateString) => {
  const options = { year: 'numeric', month: 'short', day: 'numeric' }
  return new Date(dateString).toLocaleDateString('ru-RU', options)
}
</script>

<style scoped>
.task-item {
  background: #1a1f3a;
  border: 1px solid #2a3050;
  border-radius: 8px;
  padding: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.3s ease;
}

.task-item:hover {
  border-color: #26d07c;
}

.task-item.completed {
  opacity: 0.6;
  border-color: #26d07c;
}

.task-info {
  flex: 1;
}

.task-title {
  font-weight: 600;
  color: #e0e0e0;
  margin-bottom: 0.3rem;
}

.task-title.completed {
  text-decoration: line-through;
  color: #a0a0a0;
}

.task-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: #a0a0a0;
}

.task-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: rgba(38, 208, 124, 0.1);
  color: #26d07c;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}

.task-actions {
  display: flex;
  gap: 0.5rem;
  margin-left: 1rem;
}

.btn-action {
  background: none;
  border: none;
  color: #a0a0a0;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  transition: all 0.3s ease;
  font-size: 0.9rem;
}

.btn-action:hover {
  color: #26d07c;
  background: rgba(38, 208, 124, 0.1);
}

.btn-action.delete:hover {
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.1);
}
</style>
