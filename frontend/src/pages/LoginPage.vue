<template>
  <div class="login">
    <h2>Вход</h2>
    <form @submit.prevent="handleLogin">
      <input v-model="email" type="email" placeholder="Email" required />
      <input v-model="password" type="password" placeholder="Пароль" required />
      <button type="submit">Войти</button>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
    <p>
      Нет аккаунта? <router-link to="/register">Зарегистрироваться</router-link>
    </p>
    <p>
      <router-link to="/forgot-password">Забыли пароль?</router-link>
    </p>
  </div>
</template>

<script>
export default {
  name: 'LoginPage',
  data() {
    return {
      email: '',
      password: '',
      error: null
    };
  },
  methods: {
    async handleLogin() {
      try {
        const response = await fetch('http://localhost:5000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.email, password: this.password })
        });

        const data = await response.json();

        if (!response.ok) {
          this.error = data.error || 'Ошибка входа';
          return;
        }

        // Save tokens to localStorage
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        // Redirect to dashboard
        this.$router.push('/schedules');
      } catch (err) {
        this.error = 'Ошибка подключения к серверу';
      }
    }
  }
};
</script>

<style scoped>
.login {
  max-width: 400px;
  margin: 50px auto;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 8px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

input {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

button {
  padding: 10px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background: #0056b3;
}

.error {
  color: red;
  margin: 10px 0 0 0;
}

.resend-link {
  font-size: 0.9rem;
  margin-top: 10px;
  text-align: center;
}

a {
  color: #007bff;
  text-decoration: none;
}
</style>
