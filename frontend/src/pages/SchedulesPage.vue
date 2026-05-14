<template>
  <div class="schedules">
    <div class="header">
      <h2>Мои графики уборки</h2>
      <div class="header-actions">
        <button @click="goProfile" class="btn-profile">Профиль</button>
        <button @click="showNewScheduleForm = true" class="btn-new">+ Новый график</button>
        <button @click="logout" class="btn-logout">Выход</button>
      </div>
    </div>

    <!-- New Schedule Form -->
    <div v-if="showNewScheduleForm" class="form-modal">
      <div class="form-content">
        <h3>Новый график</h3>
        <form @submit.prevent="createSchedule">
          <input v-model="newSchedule.title" placeholder="Название" required />
          <textarea v-model="newSchedule.description" placeholder="Описание"></textarea>
          <div class="form-buttons">
            <button type="submit">Создать</button>
            <button type="button" @click="showNewScheduleForm = false">Отмена</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Schedules List -->
    <div v-if="schedules.length > 0" class="schedules-grid">
      <div v-for="schedule in schedules" :key="schedule.id" class="schedule-card">
        <h3>{{ schedule.title }}</h3>
        <p v-if="schedule.description" class="description">{{ schedule.description }}</p>
        <div class="card-buttons">
          <router-link :to="`/schedule/${schedule.id}`" class="btn-view">Просмотр</router-link>
          <button @click="deleteSchedule(schedule.id)" class="btn-delete">Удалить</button>
        </div>
      </div>
    </div>
    <div v-else class="empty">
      <p>Нет графиков. Создайте новый!</p>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script>
export default {
  name: 'SchedulesPage',
  data() {
    return {
      schedules: [],
      showNewScheduleForm: false,
      newSchedule: {
        title: '',
        description: ''
      },
      error: null
    };
  },
  mounted() {
    this.fetchSchedules();
  },
  methods: {
    async fetchSchedules() {
      try {
        const response = await fetch('http://localhost:5000/api/schedules', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        });

        if (response.status === 401) {
          this.$router.push('/login');
          return;
        }

        this.schedules = await response.json();
      } catch (err) {
        this.error = 'Ошибка загрузки графиков';
      }
    },
    async createSchedule() {
      try {
        const response = await fetch('http://localhost:5000/api/schedules', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          },
          body: JSON.stringify(this.newSchedule)
        });

        if (!response.ok) {
          this.error = 'Ошибка создания графика';
          return;
        }

        const newSchedule = await response.json();
        this.schedules.push(newSchedule);
        this.showNewScheduleForm = false;
        this.newSchedule = { title: '', description: '' };
      } catch (err) {
        this.error = 'Ошибка подключения';
      }
    },
    async deleteSchedule(id) {
      if (!confirm('Удалить график?')) return;

      try {
        const response = await fetch(`http://localhost:5000/api/schedules/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        });

        if (!response.ok) {
          this.error = 'Ошибка удаления графика';
          return;
        }

        this.schedules = this.schedules.filter(s => s.id !== id);
      } catch (err) {
        this.error = 'Ошибка подключения';
      }
    },
    goProfile() {
      this.$router.push('/profile');
    },
    logout() {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      this.$router.push('/login');
    }
  }
};
</script>

<style scoped>
.schedules {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.header h2 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn-profile,
.btn-new, .btn-logout {
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-new {
  background: #28a745;
  color: white;
}

.btn-new:hover {
  background: #218838;
}

.btn-logout {
  background: #6c757d;
  color: white;
}

.btn-logout:hover {
  background: #5a6268;
}

.form-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.form-content {
  background: white;
  padding: 30px;
  border-radius: 8px;
  max-width: 500px;
  width: 100%;
}

.form-content form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.form-content input,
.form-content textarea {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: inherit;
}

.form-buttons {
  display: flex;
  gap: 10px;
}

.form-buttons button {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.form-buttons button[type="submit"] {
  background: #007bff;
  color: white;
}

.form-buttons button[type="submit"]:hover {
  background: #0056b3;
}

.form-buttons button[type="button"] {
  background: #6c757d;
  color: white;
}

.form-buttons button[type="button"]:hover {
  background: #5a6268;
}

.schedules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.schedule-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.schedule-card h3 {
  margin: 0 0 10px 0;
}

.description {
  color: #666;
  margin: 0 0 15px 0;
}

.card-buttons {
  display: flex;
  gap: 10px;
}

.btn-view, .btn-delete {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  display: block;
}

.btn-view {
  background: #007bff;
  color: white;
}

.btn-view:hover {
  background: #0056b3;
}

.btn-delete {
  background: #dc3545;
  color: white;
}

.btn-delete:hover {
  background: #c82333;
}

.empty {
  text-align: center;
  padding: 40px;
  color: #666;
}

.error {
  color: red;
  padding: 10px;
  background: #ffe0e0;
  border-radius: 4px;
  margin-top: 20px;
}
</style>
