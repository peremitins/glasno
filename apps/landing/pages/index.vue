<script setup lang="ts">
  // Временная заглушка до готовности полноценного лендинга.
  // Тексты одноязычные (ru), i18n подключим вместе с настоящим лендингом.
  import { useLandingAppAuthUrl } from '@/composables/useLandingAppAuthUrl';

  const appAuthUrl = useLandingAppAuthUrl();
</script>

<template>
  <main class="hero">
    <p class="hero__brand">Гласно</p>
    <h1 class="hero__title">Тренажёр собеседований</h1>
    <p class="hero__subtitle">
      Вставьте вакансию, пройдите репетицию интервью голосом и получите
      подробный разбор. Скоро здесь появится полноценный сайт.
    </p>
    <a class="hero__cta" :href="appAuthUrl">Войти в приложение</a>
  </main>
</template>

<style scoped>
  .hero {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
    text-align: center;
  }

  .hero__brand {
    margin: 0;
    font-size: 14px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--landing-muted);
  }

  .hero__title {
    margin: 0;
    font-size: clamp(26px, 4vw, 38px);
    line-height: 1.1;
    font-weight: 700;
  }

  .hero__subtitle {
    margin: 0;
    max-width: 480px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--landing-muted);
  }

  .hero__cta {
    margin-top: 8px;
    padding: 12px 28px;
    border-radius: 999px;
    background: var(--landing-accent);
    color: var(--landing-accent-contrast);
    font-weight: 600;
    text-decoration: none;
    transition: opacity 0.15s ease;
  }

  .hero__cta:hover {
    opacity: 0.85;
  }
</style>
