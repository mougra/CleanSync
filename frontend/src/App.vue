<template>
  <div id="app" class="app-shell">
    <TopNavigation />
    <main class="content-shell">
      <router-view />
    </main>
  </div>
</template>

<script>
import TopNavigation from './components/TopNavigation.vue'

export default {
  name: 'App',
  components: {
    TopNavigation
  }
}
</script>

<style>
html,
body,
#app {
  min-height: 100%;
  background: #eef2ff;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #102a43;
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.content-shell {
  flex: 1;
}
</style>
