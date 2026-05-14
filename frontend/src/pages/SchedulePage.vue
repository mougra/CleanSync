<template>
  <div class="schedule-page">
    <h1 class="page-title">Планирование уборки</h1>

    <div class="two-column">
      <!-- Form -->
      <div class="card">
        <h3>Добавить новую задачу</h3>
        <form @submit.prevent="handleAddTask" class="form">
          <div class="form-group">
            <label>Название задачи</label>
            <input v-model="newTask.title" placeholder="Например: Уборка кухни" required>
          </div>

          <div class="form-group">
            <label>Категория</label>
            <select v-model="newTask.category" required>
              <option>Кухня</option>
              <option>Ванная</option>
              <option>Спальня</option>
              <option>Гостиная</option>
              <option>Коридор</option>
              <option>Балкон</option>
              <option>Другое</option>
            </select>
          </div>

          <div class="form-group">
            <label>Дата</label>
            <input v-model="newTask.date" type="date" required>
          </div>

          <div class="form-group">
            <label>Время</label>
            <input v-model="newTask.time" type="time" required>
          </div>

          <div class="form-group">
            <label>Приоритет</label>
            <select v-model="newTask.priority">
              <option>Низкий</option>
              <option>Средний</option>
              <option>Высокий</option>
            </select>
          </div>

          <div class="form-group">
            <label>Описание</label>
            <textarea v-model="newTask.description" placeholder="Добавьте детали..." rows="3"></textarea>
          </div>

          <button type="submit" class="btn btn-primary full-width">Добавить задачу</button>
        </form>
      </div>

      <!-- Task List -->
      <div class="card">
        <h3>Все задачи ({{ tasks.length }})</h3>
        <div class="task-list-wrapper">
          <div v-if="tasks.length > 0" class="task-list">
            <TaskItem
              v-for="task in sortedTasks"
              :key="task.id"
              :task="task"
              @toggle="$emit('toggle-task', task.id)"
              @delete="$emit('delete-task', task.id)"
            />
          </div>
          <div v-else class="empty-state">
            <p>Нет задач</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import TaskItem from '../components/TaskItem.vue'

const props = defineProps({
  tasks: Array
})

const emit = defineEmits(['add-task', 'toggle-task', 'delete-task'])

const newTask = ref({
  title: '',
  category: 'Кухня',
  date: new Date().toISOString().split('T')[0],
  time: '10:00',
  priority: 'Средний',
  description: ''
})

const handleAddTask = () => {
  if (newTask.value.title.trim()) {
    emit('add-task', {
      title: newTask.value.title,
      category: newTask.value.category,
      date: newTask.value.date,
      time: newTask.value.time,
      priority: newTask.value.priority,
      description: newTask.value.description
    })
    resetForm()
  }
}

const resetForm = () => {
  newTask.value = {
    title: '',
    category: 'Кухня',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    priority: 'Средний',
    description: ''
  }
}

const sortedTasks = computed(() =>
  [...props.tasks].sort((a, b) => new Date(a.date) - new Date(b.date))
)
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
  margin-bottom: 2rem;
  font-size: 2rem;
}

.two-column {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}

.card {
  background: #1a1f3a;
  border: 1px solid #2a3050;
  border-radius: 8px;
  padding: 1.5rem;
}

.card h3 {
  color: #26d07c;
  margin-bottom: 1.5rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  color: #26d07c;
  margin-bottom: 0.5rem;
  font-weight: 600;
  font-size: 0.9rem;
}

.form-group input,
.form-group select,
.form-group textarea {
  background: #0a0e27;
  border: 1px solid #2a3050;
  color: #e0e0e0;
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.95rem;
  font-family: inherit;
  transition: all 0.3s ease;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #26d07c;
  box-shadow: 0 0 10px rgba(38, 208, 124, 0.2);
}

.full-width {
  width: 100%;
}

.task-list-wrapper {
  margin-top: 1rem;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.empty-state {
  text-align: center;
  padding: 2rem 1rem;
  color: #a0a0a0;
}

@media (max-width: 768px) {
  .two-column {
    grid-template-columns: 1fr;
  }

  .page-title {
    font-size: 1.5rem;
  }
}
</style>
