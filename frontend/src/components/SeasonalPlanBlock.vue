<template>
  <div class="seasonal-plan-block" :class="{ 'detailed-view': isDetailed }">
    <!-- Summary View -->
    <div v-if="!isDetailed" class="summary-view">
      <div class="header">
        <h3>Сезонная уборка</h3>
        <div class="seasonal-tag">📅 Сезон</div>
      </div>

      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: overallProgress + '%' }"></div>
        </div>
        <div class="progress-text">Завершено: {{ Math.round(overallProgress) }}%</div>
      </div>

      <button @click="isDetailed = true" class="start-button">Посмотреть планы</button>
    </div>

    <!-- Detailed View -->
    <div v-else class="detailed-view-content">
      <div class="detailed-header">
        <h3>Сезонные графики</h3>
        <button @click="isDetailed = false" class="back-button">Назад</button>
      </div>

      <div v-for="schedule in seasonalSchedules" :key="schedule.id" class="schedule-group">
        <div class="schedule-header" @click="selectedSchedule = schedule">
          <h4>{{ schedule.title }}</h4>
          <span class="schedule-progress">{{ calculateScheduleProgress(schedule) }}%</span>
        </div>

        <div v-if="selectedSchedule && selectedSchedule.id === schedule.id" class="tasks-list">
          <div v-for="task in schedule.tasks" :key="task.id" class="task-item">
            <div class="task-main" @click="selectedTask = task">
              <input type="checkbox" v-model="task.is_completed" @change="toggleTask(task)" />
              <span :class="{ 'completed': task.is_completed }">{{ task.title }}</span>
              <span class="task-time">{{ task.estimated_minutes }} мин</span>
            </div>

            <!-- Task Checklist -->
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
    </div>

    <!-- Edit Modal (same as DailyPlan) -->
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
const selectedSchedule = ref(null);
const selectedTask = ref(null);
const showEditModal = ref(false);
const newItemText = ref('');
const seasonalSchedules = ref([]);
const editTask = ref({});

const overallProgress = computed(() => {
  let total = 0;
  let completed = 0;
  seasonalSchedules.value.forEach(s => {
    total += s.tasks.length;
    completed += s.tasks.filter(t => t.is_completed).length;
  });
  return total > 0 ? (completed / total) * 100 : 0;
});

function calculateScheduleProgress(schedule) {
  if (!schedule.tasks.length) return 0;
  const completed = schedule.tasks.filter(t => t.is_completed).length;
  return Math.round((completed / schedule.tasks.length) * 100);
}

async function fetchSeasonalPlan() {
  try {
    const res = await axios.get('/api/schedules/seasonal');
    seasonalSchedules.value = res.data;

    // Fetch checklists for each task in each schedule
    for (const schedule of seasonalSchedules.value) {
      for (const task of schedule.tasks) {
        await fetchChecklist(task.id);
      }
    }
  } catch (e) {
    console.error('Error fetching seasonal plan', e);
  }
}

async function fetchChecklist(taskId) {
  try {
    const res = await axios.get(`/api/tasks/${taskId}/checklists`);
    const task = findTaskById(taskId);
    if (task) task.checklist = res.data;
  } catch (e) {
    console.error('Error fetching checklist', e);
  }
}

function findTaskById(id) {
  for (const s of seasonalSchedules.value) {
    const task = s.tasks.find(t => t.id === id);
    if (task) return task;
  }
  return null;
}

async function toggleTask(task) {
  try {
    await axios.put(`/api/tasks/${task.id}`, { is_completed: task.is_completed });
    await fetchSeasonalPlan();
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
    await fetchSeasonalPlan();
  } catch (e) {
    console.error('Error saving task', e);
  }
}

async function deleteTask(id) {
  try {
    await axios.delete(`/api/tasks/${id}`);
    showEditModal.value = false;
    await fetchSeasonalPlan();
  } catch (e) {
    console.error('Error deleting task', e);
  }
}

onMounted(fetchSeasonalPlan);
</script>

<style scoped>
.seasonal-plan-block {
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

.seasonal-tag {
  font-size: 0.8rem;
  background: #e3f2fd;
  color: #1976d2;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: bold;
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
  background: #2196f3;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.9rem;
  font-weight: bold;
}

.start-button {
  width: 100%;
  padding: 12px;
  background: #2196f3;
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

.schedule-group {
  margin-bottom: 20px;
  border: 1px solid #eee;
  border-radius: 12px;
  overflow: hidden;
}

.schedule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  background: #fcfcfc;
  cursor: pointer;
  border-bottom: 1px solid #eee;
}

.schedule-progress {
  font-size: 0.85rem;
  color: #666;
  font-weight: bold;
}

.tasks-list {
  padding: 15px;
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
