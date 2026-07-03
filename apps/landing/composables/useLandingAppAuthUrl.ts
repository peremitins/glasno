import { computed } from 'vue';
import { useRequestURL, useRuntimeConfig } from 'nuxt/app';

// При локальной разработке лендинга CTA ведут на локальное приложение,
// а не на прод.
const LOCAL_APP_AUTH_URL = 'http://localhost:3000/auth';

function isLocalOrigin(value: string): boolean {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value);
}

/**
 * Базовый auth-URL приложения для CTA лендинга.
 *
 * Локальный `nuxt dev` лендинга (origin = localhost) ведёт на
 * `http://localhost:3000/auth`, чтобы проверять сценарий целиком локально.
 * В собранном виде (прод) используется настроенный `appAuthUrl`
 * (по умолчанию `https://my.glasno.app/auth`).
 */
export function useLandingAppAuthUrl() {
  const runtimeConfig = useRuntimeConfig();
  const requestUrl = useRequestURL();

  return computed(() => {
    const configured = String(
      runtimeConfig.public.appAuthUrl || 'https://my.glasno.app/auth'
    );

    if (import.meta.dev && isLocalOrigin(requestUrl.origin)) {
      return LOCAL_APP_AUTH_URL;
    }

    return configured;
  });
}
