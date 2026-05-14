<template>
  <div class="reset-password">
    <h2>Сброс пароля</h2>
    <form @submit.prevent="handleResetPassword">
      <input v-model="newPassword" type="password" placeholder="Новый пароль" required />
      <input v-model="confirmPassword" type="password" placeholder="Подтвердите пароль" required />
      <button type="submit">Сбросить пароль</button>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="message" class="message">{{ message }}</p>
    </form>
    <p>
      <router-link to="/login">Вернуться ко входу</router-link>
    </p>
  </div>
</template>

<script>
export default {
  name: 'ResetPasswordPage',
  data() {
    return {
      newPassword: '',
      confirmPassword: '',
      token: '',
      error: null,
      message: null
    };
  },
  mounted() {
    this.token = this.$route.query.token;
    if (!this.token) {
      this.error = 'Токен сброса отсутствует';
    }
  },
  methods: {
    async handleResetPassword() {
      if (this.newPassword !== this.confirmPassword) {
        this.error = 'Пароли не совпадают';
        return;
      }

      try {
        const response = await fetch('http://localhost:5000/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: this.token, newPassword: this.newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
          this.error = data.error || 'Ошибка сброса пароля';
          return;
        }

        this.message = data.message;
        this.error = null;

        // Redirect to login after success
        setTimeout(() => {
          this.$router.push('/login');
        }, 2000);
      } catch (err) {
        this.error = 'Ошибка подключения к серверу';
      }
    }
  }
};
</script>

<style scoped>
.reset-password {
  max-width: 400px;
  margin: 50px auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

input {
  width: 100%;
  padding: 10px;
  margin: 10px 0;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  width: 100%;
  padding: 10px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #0056b3;
}

.message {
  color: green;
}

.error {
  color: red;
}
</style>