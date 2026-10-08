<script setup lang="ts">
/**
 * Иллюстрация для пустого экрана привычек: растение и календарь на полке.
 * Нарисована вручную в SVG — лицензионных ограничений нет, цвета из токенов.
 */
</script>

<template>
  <svg
    class="illustration"
    viewBox="0 0 320 200"
    role="img"
    aria-label="Растение и календарь на полке"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- полка -->
    <rect x="40" y="150" width="240" height="14" rx="7" fill="#c08a55" />
    <rect x="40" y="150" width="240" height="6" rx="3" fill="#d8a26a" />
    <rect x="62" y="164" width="12" height="16" rx="4" fill="#a97445" />
    <rect x="246" y="164" width="12" height="16" rx="4" fill="#a97445" />

    <!-- календарь -->
    <rect x="196" y="104" width="64" height="46" rx="8" fill="#fdf6ec" stroke="#e4d6c4" stroke-width="2" />
    <rect x="196" y="104" width="64" height="12" rx="6" fill="#e9d3bd" />
    <circle cx="214" cy="102" r="4" fill="#c08a55" />
    <circle cx="242" cy="102" r="4" fill="#c08a55" />
    <rect x="206" y="124" width="12" height="12" rx="3" fill="#efe2d3" />
    <rect x="224" y="124" width="12" height="12" rx="3" fill="#efe2d3" />
    <rect x="242" y="124" width="12" height="12" rx="3" fill="#efe2d3" />
    <rect x="206" y="140" width="12" height="6" rx="3" fill="#efe2d3" />
    <rect x="224" y="140" width="12" height="6" rx="3" fill="#efe2d3" />
    <path d="M213 130l4 4 7-8" fill="none" stroke="#2a584d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

    <!-- горшок -->
    <path d="M92 116h64l-7 34a10 10 0 0 1-10 9h-30a10 10 0 0 1-10-9z" fill="#d98b63" />
    <rect x="86" y="106" width="76" height="14" rx="7" fill="#e29a72" />

    <!-- листья -->
    <path d="M124 106c0-26-14-42-30-48 4 22 14 40 30 48z" fill="#2f6b58" />
    <path d="M124 106c2-30 16-50 34-56-4 26-16 48-34 56z" fill="#3d8069" />
    <path d="M124 106c-10-22-28-30-44-28 12 16 28 26 44 28z" fill="#4a9478" />
    <path d="M124 106c14-16 34-20 48-14-14 14-32 18-48 14z" fill="#35735f" />
  </svg>
</template>

<style scoped>
.illustration {
  width: 100%;
  max-width: 320px;
  height: auto;
}
</style>
