<script setup lang="ts">
  import { Toaster } from 'vue-sonner';

  // Тема тостов идёт за общей темой приложения, чтобы совпадать с интерфейсом.
  const { theme } = useDesignPreferences();
</script>

<template>
  <!--
    Индикатор навигации: показывает прогресс-бар вверху, пока грузится
    JS-чанк роута (в SPA-режиме компоненты страниц подгружаются лениво).
    Без него первый переход на тяжёлую страницу выглядит как зависание.
  -->
  <NuxtLoadingIndicator :color="'hsl(var(--primary))'" :height="2" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <Toaster :theme="theme" position="top-center" rich-colors close-button />
</template>
