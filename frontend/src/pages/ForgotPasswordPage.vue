<template>
  <div class="forgot-password">
    <h2>Восстановление пароля</h2>
    <form @submit.prevent="handleForgotPassword">
      <input v-model="email" type="email" placeholder="Email" required />
      <button type="submit">Отправить ссылку</button>
      <p v-if="message" class="message">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
    <p>
      <router-link to="/login">Вернуться ко входу</router-link>
    </p>
  </div>
</template>

<script>
export default {
  name: 'ForgotPasswordPage',
  data() {
    return {
      email: '',
      message: null,
      error: null
    };
  },
  methods: {
    async handleForgotPassword() {
      try {
        const response = await fetch('http://localhost:5000/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.email })
        });

        const data = await response.json();

        if (!response.ok) {
          this.error = data.error || 'Ошибка отправки';
          return;
        }

        this.message = data.message;
        this.error = null;
      } catch (err) {
        this.error = 'Ошибка подключения к серверу';
      }
    }
  }
};
</script>

<style scoped>
.forgot-password {
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