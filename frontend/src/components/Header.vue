<template>
  <header class="header">
    <div class="header-content flex justify-content-between align-items-center">
      <div class="logo text-2xl font-bold text-primary-500">🧹 CleanPlanner</div>
      <nav class="nav flex gap-3">
        <Button
          v-for="page in pages"
          :key="page.id"
          :label="page.label"
          :severity="currentPage === page.id ? 'primary' : 'secondary'"
          :text="true"
          class="nav-btn"
          @click="$emit('navigate', page.id)"
        />
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
import Button from 'primevue/button';

interface Page {
  id: string;
  label: string;
}

defineProps<{
  currentPage: string;
}>();

defineEmits<{
  (e: 'navigate', id: string): void;
}>();

const pages: Page[] = [
  { id: 'home', label: 'Главная' },
  { id: 'schedule', label: 'Расписание' },
  { id: 'recommendations', label: 'Рекомендации' }
];
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
}

.nav-btn {
  font-size: 0.95rem !important;
}

@media (max-width: 768px) {
  .nav {
    gap: 0.5rem !important;
  }

  .nav-btn {
    font-size: 0.85rem !important;
  }
}
</style>
