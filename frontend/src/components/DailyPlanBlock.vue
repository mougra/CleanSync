<template>
  <div class="daily-plan-block" :class="{ 'detailed-view': isDetailed }">
    <!-- Summary View -->
    <div v-if="!isDetailed" class="summary-view">
      <div class="header">
        <h3>Сегодняшний план</h3>
        <div class="time-remaining">Осталось: {{ summary.remaining_time }} мин</div>
      </div>

      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: summary.progress + '%' }"></div>
        </div>
        <div class="progress-text">{{ completedCount }}/{{ totalCount }} задач</div>
      </div>

      <button @click="isDetailed = true" class="start-button">Начать</button>
    </div>

    <!-- Detailed View -->
    <div v-else class="detailed-view-content">
      <div class="detailed-header">
        <h3>Задачи на сегодня</h3>
        <button @click="isDetailed = false" class="back-button">Назад</button>
      </div>

      <div v-for="(tasks, room) in tasksByRoom" :key="room" class="room-group">
        <h4>{{ room }}</h4>
        <div v-for="task in tasks" :key="task.id" class="task-item">
          <div class="task-main" @click="selectedTask = task">
            <input type="checkbox" v-model="task.is_completed" @change="toggleTask(task)" />
            <span :class="{ 'completed': task.is_completed }">{{ task.title }}</span>
            <span class="task-time">{{ task.estimated_minutes }} мин</span>
          </div>

          <!-- Checklist (visible if task selected) -->
          <div v-if="selectedTask && selectedTask.id === task.id" class="task-checklist">
            <div v-for="item in task.checklist" :key="item.id" class="checklist-item">
              <input type="checkbox" v-model="item.is_completed" @change="toggleChecklistItem(task.id, item)" />
              <span>{{ item.item }}</span>
            </div>
            <div class="checklist-add">
              <input v-model="newItemText" placeholder="Добавить пункт..." @keyup.enter="addItem(task.id)" />
              <button @click="addItem(task.id)">+</button>
            </div>
            <button @click="openEditModal(task)" class="edit-task-btn">Изменить задачу</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="showEditModal" class="modal-overlay">
      <div class="modal">
        <h3>Редактирование задачи</h3>
        <div class="field">
          <label>Название</label>
          <input v-model="editTask.title" />
        </div>
        <div class="field">
          <label>Комната</label>
          <input v-model="editTask.room" />
        </div>
        <div class="field">
          <label>Время (мин)</label>
          <input type="number" v-model="editTask.estimated_minutes" />
        </div>
        <div class="field">
          <label>Дата выполнения</label>
          <input type="date" v-model="editTask.due_date" />
        </div>
        <div class="modal-actions">
          <button @click="showEditModal = false">Отмена</button>
          <button @click="saveTask" class="save-btn">Сохранить</button>
          <button @click="deleteTask(editTask.id)" class="delete-btn">Удалить</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';

const isDetailed = ref(false);
const selectedTask = ref(null);
const showEditModal = ref(false);
const newItemText = ref('');
const summary = ref({
  total_tasks: 0,
  completed_tasks: 0,
  progress: 0,
  total_estimated_time: 0,
  remaining_time: 0
});
const tasksByRoom = ref({});
const editTask = ref({});

const totalCount = computed(() => summary.value.total_tasks);
const completedCount = computed(() => summary.value.completed_tasks);

async function fetchTodayPlan() {
  try {
    const res = await axios.get('/api/tasks/today');
    summary.value = res.data.summary;
    tasksByRoom.value = res.data.tasks;

    // Fetch checklists for each task
    for (const room in tasksByRoom.value) {
      for (const task of tasksByRoom.value[room]) {
        await fetchChecklist(task.id);
      }
    }
  } catch (e) {
    console.error('Error fetching today\'s plan', e);
  }
}

async function fetchChecklist(taskId) {
  try {
    // This endpoint is not yet implemented in the backend routes but described in the plan.
    // For now, we'll mock it or assume we need to implement it.
    // Actually, the GET /api/tasks/today should ideally include checklists.
    // Since it doesn't, we need to add it or call a separate endpoint.
    // Let's assume we add a GET /api/tasks/:id/checklists endpoint.
    const res = await axios.get(`/api/tasks/${taskId}/checklists`);
    const task = findTaskById(taskId);
    if (task) task.checklist = res.data;
  } catch (e) {
    console.error('Error fetching checklist', e);
  }
}

function findTaskById(id) {
  for (const room in tasksByRoom.value) {
    const task = tasksByRoom.value[room].find(t => t.id === id);
    if (task) return task;
  }
  return null;
}

async function toggleTask(task) {
  try {
    await axios.put(`/api/tasks/${task.id}`, { is_completed: task.is_completed });
    await fetchTodayPlan();
  } catch (e) {
    console.error('Error toggling task', e);
  }
}

async function toggleChecklistItem(taskId, item) {
  try {
    await axios.patch(`/api/checklists/${item.id}`, { is_completed: item.is_completed });
  } catch (e) {
    console.error('Error toggling checklist item', e);
  }
}

async function addItem(taskId) {
  if (!newItemText.value) return;
  try {
    const res = await axios.post(`/api/tasks/${taskId}/checklists`, { item: newItemText.value });
    const task = findTaskById(taskId);
    if (task) task.checklist.push(res.data);
    newItemText.value = '';
  } catch (e) {
    console.error('Error adding checklist item', e);
  }
}

function openEditModal(task) {
  editTask.value = { ...task };
  showEditModal.value = true;
}

async function saveTask() {
  try {
    await axios.put(`/api/tasks/${editTask.value.id}`, editTask.value);
    showEditModal.value = false;
    await fetchTodayPlan();
  } catch (e) {
    console.error('Error saving task', e);
  }
}

async function deleteTask(id) {
  try {
    await axios.delete(`/api/tasks/${id}`);
    showEditModal.value = false;
    await fetchTodayPlan();
  } catch (e) {
    console.error('Error deleting task', e);
  }
}

onMounted(fetchTodayPlan);
</script>

<style scoped>
.daily-plan-block {
  background: white;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  margin-bottom: 20px;
  transition: all 0.3s ease;
}

.summary-view .header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.time-remaining {
  font-size: 0.9rem;
  color: #666;
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
}

.progress-bar {
  flex: 1;
  height: 10px;
  background: #eee;
  border-radius: 5px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #4caf50;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.9rem;
  font-weight: bold;
}

.start-button {
  width: 100%;
  padding: 12px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
}

.detailed-view-content {
  max-width: 600px;
  margin: 0 auto;
}

.detailed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.back-button {
  background: none;
  border: 1px solid #ccc;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.room-group {
  margin-bottom: 20px;
}

.room-group h4 {
  color: #888;
  font-size: 0.9rem;
  text-transform: uppercase;
  border-bottom: 1px solid #eee;
  padding-bottom: 5px;
  margin-bottom: 10px;
}

.task-item {
  margin-bottom: 10px;
}

.task-main {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 8px;
  cursor: pointer;
}

.task-main:hover {
  background: #f0f0f0;
}

.completed {
  text-decoration: line-through;
  color: #888;
}

.task-time {
  margin-left: auto;
  font-size: 0.8rem;
  color: #999;
}

.task-checklist {
  padding: 10px 10px 10px 35px;
  background: #f9f9f9;
  border-radius: 0 0 8px 8px;
}

.checklist-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  margin-bottom: 5px;
}

.checklist-add {
  display: flex;
  gap: 5px;
  margin-top: 10px;
}

.checklist-add input {
  flex: 1;
  padding: 4px 8px;
  font-size: 0.8rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.checklist-add button {
  padding: 4px 8px;
  background: #eee;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.edit-task-btn {
  margin-top: 10px;
  font-size: 0.75rem;
  background: none;
  border: none;
  color: #007bff;
  cursor: pointer;
  padding: 0;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 25px;
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 15px;
}

.field label {
  font-size: 0.8rem;
  color: #666;
}

.field input {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.save-btn {
  background: #4caf50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.delete-btn {
  background: #f44336;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}
</style>
