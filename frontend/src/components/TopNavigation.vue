<template>
  <header class="top-navigation p-shadow-2">
    <div class="brand-block">
      <div class="brand-badge">CP</div>
      <div>
        <div class="brand-name">Clean Planner</div>
        <div class="brand-subtitle">Домашняя уборка без стресса</div>
      </div>
    </div>

    <TabMenu :model="items" :active-item="activeItem" class="route-tabs" />

    <div class="actions-block">
      <button v-if="auth.isAuthenticated" class="profile-btn p-button p-button-text" @click="goProfile">
        <i class="pi pi-user"></i>
        <span>{{ auth.userName || 'Профиль' }}</span>
      </button>
      <button v-else class="login-btn p-button p-button-secondary" @click="auth.openAuthDialog()">
        Войти
      </button>
    </div>

    <AuthDialog v-model:visible="auth.isAuthDialogOpen" />
  </header>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TabMenu from 'primevue/tabmenu'
import AuthDialog from './AuthDialog.vue'
import { useAuthStore } from '../entities/auth/authStore'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const items = [
  { label: 'Сегодня', icon: 'pi pi-home', command: () => router.push('/') },
  { label: 'Инсайты', icon: 'pi pi-lightbulb', command: () => router.push('/insights') },
  { label: 'Чек-листы', icon: 'pi pi-list', command: () => router.push('/checklists') }
]

const activeItem = ref(items[0])

const syncActiveItem = () => {
  const path = route.path
  if (path === '/insights') {
    activeItem.value = items[1]
  } else if (path === '/checklists') {
    activeItem.value = items[2]
  } else {
    activeItem.value = items[0]
  }
}

watch(() => route.path, syncActiveItem, { immediate: true })

const goProfile = () => {
  router.push('/profile')
}
</script>

<style scoped>
.top-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: rgba(255, 255, 255, 0.94);
  border-bottom: 1px solid rgba(25, 32, 59, 0.14);
  backdrop-filter: blur(18px);
  position: sticky;
  top: 0;
  z-index: 20;
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.brand-badge {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: linear-gradient(135deg, #ffb347, #ffcc33);
  color: #1d1f33;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 1.05rem;
}

.brand-name {
  font-weight: 700;
  color: #102a43;
}

.brand-subtitle {
  color: #52648c;
  font-size: 0.85rem;
}

.route-tabs {
  flex: 1;
  max-width: 700px;
}

.actions-block {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.login-btn,
.profile-btn {
  min-width: 100px;
}

.login-btn {
  background: #ff7a59;
  color: #ffffff;
}

.login-btn:hover {
  background: #f1633f;
}

.profile-btn {
  color: #102a43;
}

@media (max-width: 900px) {
  .top-navigation {
    flex-wrap: wrap;
    justify-content: center;
  }

  .route-tabs {
    width: 100%;
    margin-top: 0.5rem;
  }
}
</style>