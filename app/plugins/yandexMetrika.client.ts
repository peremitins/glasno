import { defineNuxtPlugin } from '#app';
import { useRouter } from 'vue-router';
import { YANDEX_METRIKA_COUNTER_ID } from '@/shared/config/yandexMetrika';

type YandexMetrikaFunction = ((...args: unknown[]) => void) & {
  a?: unknown[][];
  l?: number;
};

declare global {
  interface Window {
    ym?: YandexMetrikaFunction;
  }
}

const SCRIPT_ID = 'yandex-metrika-tag';
const COUNTER_ID = Number(YANDEX_METRIKA_COUNTER_ID);

function createQueuedMetrika(): YandexMetrikaFunction {
  const ym: YandexMetrikaFunction = (...args) => {
    ym.a?.push(args);
  };

  ym.a = [];
  ym.l = Date.now();

  return ym;
}

function loadMetrikaScript(): void {
  if (document.getElementById(SCRIPT_ID)) return;

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.append(script);
}

export default defineNuxtPlugin(() => {
  const ym =
    typeof window.ym === 'function' ? window.ym : createQueuedMetrika();
  window.ym = ym;

  // Очередь создана синхронно до init: блокировщик или медленная сеть не
  // способны прервать запуск приложения, а tag.js обработает накопленные вызовы.
  ym(COUNTER_ID, 'init', {
    webvisor: true,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
  });
  loadMetrikaScript();

  const router = useRouter();
  router.afterEach((to, from) => {
    ym(COUNTER_ID, 'hit', to.fullPath, { referer: from.fullPath });
  });
});
