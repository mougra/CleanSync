<template>
  <header class="header">
    <div class="header-content">
      <div class="logo">🧹 CleanPlanner</div>
      <nav class="nav">
        <button
          v-for="page in pages"
          :key="page.id"
          :class="['nav-btn', { active: currentPage === page.id }]"
          @click="$emit('navigate', page.id)"
        >
          {{ page.label }}
        </button>
      </nav>
    </div>
  </header>
</template>

<script setup>
defineProps({
  currentPage: String
})

defineEmits(['navigate'])

const pages = [
  { id: 'home', label: 'Главная' },
  { id: 'schedule', label: 'Расписание' },
  { id: 'recommendations', label: 'Рекомендации' }
]
</script>

<style scoped>
.header {
  background: #1a1f3a;
  border-bottom: 1px solid #2a3050;
  padding: 1rem 2rem;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  font-size: 1.5rem;
  font-weight: 700;
  color: #26d07c;
}

.nav {
  display: flex;
  gap: 2rem;
}

.nav-btn {
  background: none;
  border: none;
  color: #a0a0a0;
  cursor: pointer;
  font-size: 0.95rem;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: all 0.3s ease;
  font-family: inherit;
}

.nav-btn:hover {
  color: #26d07c;
}

.nav-btn.active {
  color: #26d07c;
  background: rgba(38, 208, 124, 0.1);
}

@media (max-width: 768px) {
  .nav {
    gap: 0.5rem;
  }

  .nav-btn {
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
  }
}
</style>
