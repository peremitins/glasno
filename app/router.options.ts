import type { RouterConfig } from '@nuxt/schema';

export default {
  scrollBehavior(_to, _from, savedPosition) {
    // При «Назад» и «Вперёд» сохраняем нативное поведение браузера.
    if (savedPosition) {
      return savedPosition;
    }

    // Обычный переход всегда открывает новую страницу с начала контента.
    return { left: 0, top: 0 };
  },
} satisfies RouterConfig;
