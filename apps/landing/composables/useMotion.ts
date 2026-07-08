import type Lenis from 'lenis';
import { useNuxtApp } from 'nuxt/app';

/**
 * Доступ к состоянию движения, поднятому плагином motion.client.ts.
 * `lenis` равен null при reduced-motion (или на сервере).
 */
export function useMotion() {
  const nuxtApp = useNuxtApp();
  return {
    lenis: (nuxtApp.$lenis as Lenis | null) ?? null,
    reducedMotion: Boolean(nuxtApp.$reducedMotion),
  };
}

/**
 * Плавный скролл к секции по id/селектору/элементу. При reduced-motion и
 * отсутствии Lenis — мгновенный нативный скролл (доступность сохранена).
 */
export function useScrollTo() {
  const { lenis } = useMotion();

  return (target: string | HTMLElement, offset = -12) => {
    if (lenis) {
      lenis.scrollTo(target, { offset });
      return;
    }
    if (typeof document === 'undefined') return;
    const el =
      typeof target === 'string' ? document.querySelector(target) : target;
    el?.scrollIntoView({ behavior: 'auto', block: 'start' });
  };
}
