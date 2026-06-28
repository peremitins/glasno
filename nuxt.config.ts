import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

// Конфиг по образцу Mentala, но без Capacitor/мобильного слоя.
// SPA-режим (ssr:false) на старте; при необходимости SEO для базы вопросов
// включим SSR/гибрид-рендеринг точечно на нужных маршрутах.
export default defineNuxtConfig({
  ssr: false,
  // srcDir по умолчанию = app/ (Nuxt 4). Pages/layouts/plugins/app.vue лежат там.
  // server/ и shared/ — в корне проекта (так их и ждёт Nuxt).
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // '@' указывает на корень проекта: '@/shared/dto', '@/app/...'.
  alias: {
    '@': fileURLToPath(new URL('./', import.meta.url)),
  },

  modules: ['@vueuse/nuxt', '@pinia/nuxt'],

  css: ['@/app/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  // Плагин i18n (vue-i18n) лежит в app/plugins/ и регистрируется автоматически.
  // Сейчас только русский; архитектура готова к добавлению английского.

  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'JobAI — тренажёр собеседований',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: 'anonymous',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap&subset=cyrillic,cyrillic-ext,latin',
        },
      ],
    },
  },

  runtimeConfig: {
    // Серверные секреты (из .env, префикс NUXT_)
    databaseUrl: '',
    redisUrl: '',
    openaiApiKey: '',
    sessionSecret: '',
    hhApiBaseUrl: 'https://api.hh.ru',
    public: {
      // Доступно на клиенте (префикс NUXT_PUBLIC_)
      appName: 'JobAI',
      apiBase: '/api',
    },
  },

  nitro: {
    preset: 'node-server',
  },
});
