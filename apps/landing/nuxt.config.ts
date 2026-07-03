import { fileURLToPath } from 'node:url';
import { defineNuxtConfig } from 'nuxt/config';

const landingRoot = fileURLToPath(new URL('./', import.meta.url));
const landingCss = fileURLToPath(
  new URL('./assets/css/landing.css', import.meta.url)
);

// Лендинг — отдельное Nuxt-приложение (как у Mentala): собирается статикой
// через `pnpm landing:generate` и деплоится на glasno.app. Основное приложение
// живёт на my.glasno.app и собирается корневым конфигом.
export default defineNuxtConfig({
  ssr: true,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  srcDir: '',
  components: false,
  alias: {
    '@': landingRoot,
  },
  css: [landingCss],
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: ['/'],
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
            'Гласно — репетиция собеседования с голосовым интервьюером: вставьте вакансию, пройдите интервью, получите разбор.',
        },
        // Заглушка не должна попадать в индекс. Убрать при запуске полноценного лендинга.
        { name: 'robots', content: 'noindex, nofollow' },
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
});
