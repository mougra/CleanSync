<script setup lang="ts">
// Сессия подтягивается один раз за рендер: на сервере — чтобы страница сразу
// знала пользователя, на клиенте — из payload без повторного запроса.
const auth = useAuthStore();
await useAsyncData('auth-session', () => auth.fetchSession());

// Язык, dir и hreflang для SEO: в i18n v10 все они включены по умолчанию
// (lang/dir/seo), поэтому вызов без опций.
const head = useLocaleHead();
useHead(() => head.value);

// Canonical и og:url: модуль nuxt-seo их в нашей связке не доносит до разметки
// (см. комментарий в composables/useCanonical.ts).
useCanonical();

// Значения по умолчанию для соцсетей: без своей картинки страница
// не покажет превью при шаринге. Страницы со своей обложкой перекрывают это.
useSeoMeta({
  ogSiteName: 'Clean Planner',
  ogImage: '/photos/spring-cleaning.jpg',
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
