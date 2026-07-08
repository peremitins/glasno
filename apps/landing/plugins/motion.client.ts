import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { defineNuxtPlugin } from 'nuxt/app';

/**
 * Единая точка инициализации движения лендинга.
 *
 * Плагин выполняется до монтирования компонентов, поэтому Lenis и связка с
 * ScrollTrigger готовы раньше, чем секции начнут создавать свои триггеры
 * (дочерние компоненты монтируются раньше родителя).
 *
 * При `prefers-reduced-motion: reduce` плавный скролл не запускается —
 * остаётся нативная прокрутка, а секции сами не анимируют контент.
 */
export default defineNuxtPlugin(() => {
  gsap.registerPlugin(ScrollTrigger, SplitText);

  const prefersReduced = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (prefersReduced) {
    return {
      provide: { lenis: null as Lenis | null, reducedMotion: true },
    };
  }

  const lenis = new Lenis({
    duration: 1.05,
    // экспоненциальный ease-out: без отскока, мягкое торможение
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    touchMultiplier: 1.6,
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Dev-only: доступ к инстансу Lenis из консоли/скриптов для отладки скролла.
  if (import.meta.dev) {
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
  }

  return {
    provide: { lenis, reducedMotion: false },
  };
});
