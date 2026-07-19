import { START_LOCATION } from 'vue-router';
import type { RouterConfig } from '@nuxt/schema';

export default {
  scrollBehavior(to, from, savedPosition) {
    // Самая первая навигация — страница ещё не отрисована, ждать нечего.
    if (from === START_LOCATION) {
      return savedPosition ?? { left: 0, top: 0 };
    }

    // Навигация в пределах одной страницы (якорь, query) позицию не сбрасывает;
    // к якорю ведём плавной прокруткой.
    if (to.path.replace(/\/$/, '') === from.path.replace(/\/$/, '')) {
      if (to.hash) {
        return { el: to.hash, behavior: 'smooth' };
      }
      return from.hash ? { left: 0, top: 0 } : false;
    }

    // «Назад»/«Вперёд» восстанавливают сохранённую позицию истории,
    // обычный переход открывает новую страницу с начала контента.
    const position = savedPosition ?? { left: 0, top: 0 };

    // Страницы монтируются асинхронно (Suspense + ленивые чанки), поэтому
    // скроллим только после подмены DOM: ранний scrollTo применяется к ещё
    // видимой старой странице и сбивается при смене контента. behavior:
    // 'instant' обходит глобальный scroll-behavior: smooth — его анимацию
    // браузер обрывает на подмене DOM, оставляя скролл посередине страницы.
    const nuxtApp = useNuxtApp();

    return new Promise((resolve) => {
      nuxtApp.hooks.hookOnce('page:loading:end', () => {
        setTimeout(() => resolve({ ...position, behavior: 'instant' }), 0);
      });
    });
  },
} satisfies RouterConfig;
