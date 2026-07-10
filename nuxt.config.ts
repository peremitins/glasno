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
  devtools: { enabled: false },

  // '@' указывает на корень проекта: '@/shared/dto', '@/app/...'.
  alias: {
    '@': fileURLToPath(new URL('./', import.meta.url)),
  },

  modules: ['@vueuse/nuxt', '@pinia/nuxt', 'shadcn-nuxt', '@nuxt/eslint'],

  shadcn: {
    prefix: '',
    componentDir: '@/app/components/ui',
  },

  css: ['@/app/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['@radix-icons/vue', 'gsap', 'reka-ui', 'vue-i18n'],
    },
  },

  // Плагин i18n (vue-i18n) лежит в app/plugins/ и регистрируется автоматически.
  // Сейчас только русский; архитектура готова к добавлению английского.

  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Гласно — тренажёр собеседований',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      meta: [
        { name: 'application-name', content: 'Гласно' },
        { name: 'apple-mobile-web-app-title', content: 'Гласно' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        {
          name: 'apple-mobile-web-app-status-bar-style',
          content: 'black-translucent',
        },
        { name: 'theme-color', content: '#070a18' },
        { name: 'msapplication-TileColor', content: '#070a18' },
        { name: 'msapplication-config', content: '/browserconfig.xml' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '16x16',
          href: '/favicon-16x16.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          href: '/favicon-32x32.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '48x48',
          href: '/favicon-48x48.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '96x96',
          href: '/favicon-96x96.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '120x120',
          href: '/apple-touch-icon-120x120.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '152x152',
          href: '/apple-touch-icon-152x152.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '167x167',
          href: '/apple-touch-icon-167x167.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '180x180',
          href: '/apple-touch-icon.png',
        },
        { rel: 'manifest', href: '/site.webmanifest' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: 'anonymous',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap&subset=cyrillic,cyrillic-ext,latin',
        },
      ],
    },
  },

  runtimeConfig: {
    // Серверные секреты (из .env, префикс NUXT_)
    databaseUrl: '',
    redisUrl: '',
    openaiApiKey: '',
    openaiModel: 'gpt-5.4-nano', // была 'gpt-4o-mini' (заменено 2026-07: дешевле/сильнее преемник)
    openaiLearningModel: 'gpt-5-nano', // подсказки-термины: самая дешёвая модель
    realtimeModel: 'gpt-realtime',
    realtimeVoice: 'marin',
    realtimeTranscriptionModel: 'gpt-4o-mini-transcribe',
    ttsModel: 'gpt-4o-mini-tts',
    ttsVoice: 'alloy',
    featureTtsEnabled: process.env.NUXT_FEATURE_TTS_ENABLED === 'true',
    sessionSecret: '',
    telegramBotToken: '',
    authEmailCodeSecret: '',
    emailHashPepper: '',
    hhApiBaseUrl: 'https://api.hh.ru',
    hhAccessToken: '',
    hhClientId: '',
    hhClientSecret: '',
    yookassaShopId: '',
    yookassaSecretKey: '',
    yookassaTestMode: process.env.NUXT_YOOKASSA_TEST_MODE === 'true',
    public: {
      // Доступно на клиенте (префикс NUXT_PUBLIC_)
      appName: 'Гласно',
      apiBase: '/api',
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3000',
      landingUrl:
        process.env.NUXT_PUBLIC_LANDING_SITE_URL || 'https://glasno.app',
      speechDefaultEngine:
        process.env.NUXT_PUBLIC_SPEECH_DEFAULT_ENGINE || 'webspeech',
      featureTtsEnabled: process.env.NUXT_FEATURE_TTS_ENABLED === 'true',
    },
  },

  nitro: {
    preset: 'node-server',
    experimental: {
      websocket: true,
    },
  },
});
