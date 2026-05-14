<template>
  <div class="profile-page">
    <h2>Профиль</h2>

    <div class="profile-card">
      <img :src="user.avatar_url || defaultAvatar" alt="avatar" />
      <div class="profile-info">
        <p><strong>Email:</strong> {{ user.email }}</p>
        <p>
          <strong>Статус:</strong>
          {{ user.is_email_confirmed ? 'Подтверждён' : 'Не подтверждён — доступно большинство функций' }}
        </p>
        <button v-if="!user.is_email_confirmed" type="button" class="btn-resend" @click="resendConfirmation">
          Отправить подтверждение заново
        </button>
        <p v-if="!user.is_email_confirmed" class="hint">
          Необходимо подтвердить email для смены пароля и других важных операций.
        </p>
      </div>
    </div>

    <form @submit.prevent="updateProfile" class="profile-form">
      <label>
        Никнейм
        <input v-model="form.username" required />
      </label>
      <label>
        Avatar URL
        <input v-model="form.avatarUrl" placeholder="https://..." />
      </label>
      <button type="submit">Сохранить профиль</button>
      <p v-if="message" class="message">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
    </form>

    <div class="password-block">
      <h3>Сменить пароль</h3>
      <form @submit.prevent="changePassword">
        <label>
          Текущий пароль
          <input type="password" v-model="passwordForm.currentPassword" required />
        </label>
        <label>
          Новый пароль
          <input type="password" v-model="passwordForm.newPassword" required />
        </label>
        <label>
          Подтвердите новый пароль
          <input type="password" v-model="passwordForm.confirmPassword" required />
        </label>
        <button type="submit">Изменить пароль</button>
      </form>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ProfilePage',
  data() {
    return {
      user: {},
      form: {
        username: '',
        avatarUrl: ''
      },
      passwordForm: {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      },
      message: null,
      error: null,
      defaultAvatar: 'https://ui-avatars.com/api/?name=User&background=random&color=fff'
    };
  },
  mounted() {
    this.loadProfile();
  },
  methods: {
    async loadProfile() {
      try {
        const response = await fetch('http://localhost:5000/api/auth/me', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`
          }
        });

        if (!response.ok) {
          this.$router.push('/login');
          return;
        }

        this.user = await response.json();
        this.form.username = this.user.username || '';
        this.form.avatarUrl = this.user.avatar_url || '';
      } catch (err) {
        this.error = 'Не удалось загрузить профиль';
      }
    },
    async updateProfile() {
      try {
        const response = await fetch('http://localhost:5000/api/auth/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`
          },
          body: JSON.stringify(this.form)
        });

        const data = await response.json();
        if (!response.ok) {
          this.error = data.error || 'Ошибка сохранения профиля';
          return;
        }

        this.user = data;
        this.message = 'Профиль сохранён';
        this.error = null;
      } catch (err) {
        this.error = 'Ошибка подключения';
      }
    },
    async resendConfirmation() {
      try {
        const response = await fetch('http://localhost:5000/api/auth/resend-confirmation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: this.user.email })
        });

        const data = await response.json();
        if (!response.ok) {
          this.error = data.error || 'Ошибка отправки подтверждения';
          return;
        }

        this.message = 'Письмо с подтверждением отправлено повторно.';
        this.error = null;
      } catch (err) {
        this.error = 'Ошибка подключения';
      }
    },
    async changePassword() {
      if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
        this.error = 'Пароли не совпадают';
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
            currentPassword: this.passwordForm.currentPassword,
            newPassword: this.passwordForm.newPassword
          })
        });

        const data = await response.json();
        if (!response.ok) {
          this.error = data.error || 'Ошибка изменения пароля';
          return;
        }

        this.message = data.message;
        this.error = null;
        this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
      } catch (err) {
        this.error = 'Ошибка подключения';
      }
    }
  }
};
</script>

<style scoped>
.profile-page {
  max-width: 600px;
  margin: 40px auto;
  padding: 20px;
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 30px;
}

.profile-card img {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid #ddd;
}

.profile-info p {
  margin: 5px 0;
}

.profile-form,
.password-block form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

input {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  width: 100%;
}

button {
  width: fit-content;
  padding: 10px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background: #0056b3;
}

.btn-resend {
  margin-top: 10px;
  padding: 8px 12px;
  background: #ffc107;
  color: #212529;
}

.btn-resend:hover {
  background: #e0a800;
}

.hint {
  color: #6c757d;
  font-size: 0.95rem;
  margin-top: 10px;
}

.message {
  color: green;
}

.error {
  color: red;
}
</style>