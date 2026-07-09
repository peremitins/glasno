import { fileURLToPath } from 'node:url';
import { defineNuxtConfig } from 'nuxt/config';
import tailwindcss from '@tailwindcss/vite';

const landingRoot = fileURLToPath(new URL('./', import.meta.url));
const landingCss = fileURLToPath(
  new URL('./assets/css/landing.css', import.meta.url)
);
const componentsDir = fileURLToPath(new URL('./components', import.meta.url));

// Лендинг — отдельное Nuxt-приложение (как у Mentala): собирается статикой
// через `pnpm landing:generate` и деплоится на glasno.app. Основное приложение
// живёт на my.glasno.app и собирается корневым конфигом.
const config = {
  ssr: true,
  compatibilityDate: '2025-07-15' as const,
  devtools: { enabled: false },
  srcDir: '',
  // Авто-импорт компонентов лендинга из ./components (секции + ui-примитивы).
  components: [{ path: componentsDir, pathPrefix: false }],
  alias: {
    '@': landingRoot,
  },
  modules: ['nuxt-yandex-metrika'],
  // Яндекс.Метрика: ID из env (NUXT_PUBLIC_YANDEX_METRIKA_ID). Без ID модуль
  // не активируется — локальная разработка не шлёт хиты.
  yandexMetrika: {
    id:
      String(process.env.NUXT_PUBLIC_YANDEX_METRIKA_ID || '').trim() ||
      undefined,
    cdn: true,
    options: {
      webvisor: true,
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
    },
  },
  css: [landingCss],
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: [
        '/',
        '/robots.txt',
        '/sitemap.xml',
        '/legal/privacy-policy-ru.html',
        '/legal/terms-of-service-ru.html',
      ],
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Гласно — тренажёр собеседований',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      meta: [
        {
          name: 'description',
          content:
            'Гласно — тренажёр собеседований с живым голосовым AI-интервьюером, подсказками во время ответа и подробным разбором.',
        },
        { name: 'robots', content: 'index, follow' },
        { name: 'application-name', content: 'Гласно' },
        { name: 'apple-mobile-web-app-title', content: 'Гласно' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        {
          name: 'apple-mobile-web-app-status-bar-style',
          content: 'black-translucent',
        },
        { name: 'theme-color', content: '#0b0d12' },
        { name: 'msapplication-TileColor', content: '#0b0d12' },
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
      ],
    },
  },
  runtimeConfig: {
    public: {
      // CTA лендинга ведут на вход в приложение.
      appAuthUrl:
        process.env.NUXT_PUBLIC_APP_AUTH_URL || 'https://my.glasno.app/auth',
      landingSiteUrl:
        process.env.NUXT_PUBLIC_LANDING_SITE_URL || 'https://glasno.app',
      // Коды подтверждения прав в Search Console / Яндекс.Вебмастер (env).
      yandexVerification: process.env.NUXT_PUBLIC_YANDEX_VERIFICATION || '',
      googleSiteVerification:
        process.env.NUXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
    },
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        '@radix-icons/vue',
        'gsap',
        'gsap/ScrollTrigger',
        'gsap/SplitText',
        'lenis',
      ],
    },
  },
};

export default defineNuxtConfig(config);
