<template>
  <div class="home-page page-container">
    <TodayPanel />
    <InsightsPreview />
    <ChecklistPreview />
  </div>
</template>

<script setup>
import TodayPanel from './components/TodayPanel.vue'
import InsightsPreview from './components/InsightsPreview.vue'
import ChecklistPreview from './components/ChecklistPreview.vue'
</script>

<style scoped>
.home-page {
  display: grid;
  gap: 1.5rem;
  padding: 0.75rem 0;
}
</style>