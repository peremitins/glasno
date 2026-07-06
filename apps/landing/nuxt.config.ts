import { fileURLToPath } from 'node:url';
import { defineNuxtConfig } from 'nuxt/config';
import tailwindcss from '@tailwindcss/vite';

const landingRoot = fileURLToPath(new URL('./', import.meta.url));
const landingCss = fileURLToPath(
  new URL('./assets/css/landing.css', import.meta.url)
);

// Лендинг — отдельное Nuxt-приложение (как у Mentala): собирается статикой
// через `pnpm landing:generate` и деплоится на glasno.app. Основное приложение
// живёт на my.glasno.app и собирается корневым конфигом.
const config = {
  ssr: true,
  compatibilityDate: '2025-07-15' as const,
  devtools: { enabled: false },
  srcDir: '',
  components: false,
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
        { name: 'theme-color', content: '#080b12' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  runtimeConfig: {
    public: {
      // CTA лендинга ведут на вход в приложение.
      appAuthUrl:
        process.env.NUXT_PUBLIC_APP_AUTH_URL || 'https://my.glasno.app/auth',
      landingSiteUrl:
        process.env.NUXT_PUBLIC_LANDING_SITE_URL || 'https://glasno.app',
    },
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['@radix-icons/vue', 'gsap'],
    },
  },
};

export default defineNuxtConfig(config);
