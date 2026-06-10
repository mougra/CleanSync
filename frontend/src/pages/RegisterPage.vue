<template>
  <div class="register">
    <h2>Регистрация</h2>
    <form @submit.prevent="handleRegister">
      <input v-model="email" type="email" placeholder="Email" required />
      <p class="hint">Можно использовать любой рабочий email — Gmail, Яндекс, Mail.ru и т.д.</p>
      <input v-model="password" type="password" placeholder="Пароль" required />
      <input v-model="confirmPassword" type="password" placeholder="Повторите пароль" required />
      <button type="submit">Зарегистрироваться</button>
      <p v-if="message" class="message">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
    <p>
      Уже есть аккаунт? <router-link to="/login">Войти</router-link>
    </p>
  </div>
</template>

<script>
export default {
  name: 'RegisterPage',
  data() {
    return {
      email: '',
      password: '',
      confirmPassword: '',
      error: null,
      message: null
    };
  },
  methods: {
    async handleRegister() {
      this.message = null;
      if (this.password !== this.confirmPassword) {
        this.error = 'Пароли не совпадают';
        return;
      }

      try {
        const response = await fetch('http://localhost:5000/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.email, password: this.password })
        });

        const data = await response.json();

        if (!response.ok) {
          this.error = data.error || 'Ошибка регистрации';
          return;
        }

        this.message = data.message || 'Регистрация успешна. Пожалуйста, подтвердите email для входа.';
        this.error = null;
        this.email = '';
        this.password = '';
        this.confirmPassword = '';
      } catch (err) {
        this.error = 'Ошибка подключения к серверу';
      }
    }
  }
};
</script>

<style scoped>
.register {
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
  background: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background: #218838;
}

.hint {
  color: #6c757d;
  font-size: 0.9rem;
  margin-top: -8px;
  margin-bottom: 14px;
}

.message {
  color: green;
  margin: 10px 0 0 0;
}

.error {
  color: red;
  margin: 10px 0 0 0;
}

a {
  color: #007bff;
  text-decoration: none;
}
</style>
