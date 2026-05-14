<template>
  <div class="confirm-email">
    <h2>Подтверждение email</h2>
    <p v-if="status === 'loading'">Проверка...</p>
    <p v-if="status === 'success'" class="message">Email подтверждён. Теперь вы можете войти.</p>
    <p v-if="status === 'error'" class="error">{{ error }}</p>
    <router-link v-if="status === 'success'" to="/login">Перейти на вход</router-link>
  </div>
</template>

<script>
export default {
  name: 'EmailConfirmPage',
  data() {
    return {
      status: 'loading',
      error: null
    };
  },
  async mounted() {
    const token = this.$route.query.token;
    if (!token) {
      this.error = 'Токен отсутствует';
      this.status = 'error';
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/auth/confirm-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const data = await response.json();
      if (!response.ok) {
        this.error = data.error || 'Ошибка подтверждения email';
        this.status = 'error';
        return;
      }

      this.status = 'success';
    } catch (err) {
      this.error = 'Ошибка подключения к серверу';
      this.status = 'error';
    }
  }
};
</script>

<style scoped>
.confirm-email {
  max-width: 500px;
  margin: 50px auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.message {
  color: green;
}

.error {
  color: red;
}
</style>