import type { InjectionKey } from 'vue';

// Страница интервью раскрывается в псевдо-fullscreen (CSS-класс call--fs,
// не Fullscreen API). Виджет оплаты YooKassa инжектит свой оверлей в body
// с неизвестным z-index и может оказаться под call--fs, поэтому перед
// открытием оплаты модалки просят страницу свернуть полноэкранный режим.
// Ключ опционален: вне интервью provide отсутствует и exit не вызывается.
export interface FullscreenEscape {
  exit: () => void;
}

export const FullscreenEscapeKey: InjectionKey<FullscreenEscape> = Symbol(
  'fullscreen-escape'
);
