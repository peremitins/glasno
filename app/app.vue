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
</template>
