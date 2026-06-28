import { createI18n } from 'vue-i18n';
import ru from './locales/ru.json';

// Сейчас только русский. Чтобы добавить английский — заведи locales/en.json
// и зарегистрируй его в messages ниже. Никаких других изменений не нужно:
// весь UI обращается к ключам через t('...'), а не к строкам напрямую.
export const SUPPORTED_LOCALES = ['ru'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'ru',
  messages: {
    ru,
  },
});
