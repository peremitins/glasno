import { onBeforeUnmount, onMounted, type Ref } from 'vue';
import { useNuxtApp } from 'nuxt/app';
import { gsap } from 'gsap';

interface RevealOptions {
  /** Смещение по Y на старте, px */
  y?: number;
  /** Точка старта ScrollTrigger */
  start?: string;
  /** Селектор reveal-элементов внутри scope */
  selector?: string;
}

/**
 * Reveal всех `[data-reveal]` внутри scope. Каждому элементу — свой fromTo со
 * ScrollTrigger(once): при обновлении/перемотке ScrollTrigger корректно доводит
 * уже прокрученные элементы до конечного состояния (batch этого не гарантирует).
 *
 * При reduced-motion ничего не прячем — контент виден и статичен (SSG-safe:
 * до гидрации элементы не скрыты).
 */
export function useReveal(scope: Ref<HTMLElement | null>, opts: RevealOptions = {}) {
  const nuxtApp = useNuxtApp();
  let ctx: gsap.Context | null = null;

  onMounted(() => {
    if (nuxtApp.$reducedMotion || !scope.value) return;

    ctx = gsap.context(() => {
      const items = gsap.utils.toArray<HTMLElement>(
        opts.selector ?? '[data-reveal]'
      );

      items.forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: opts.y ?? 28 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: el,
              start: opts.start ?? 'top 88%',
              once: true,
            },
          }
        );
      });
    }, scope.value);
  });

  onBeforeUnmount(() => {
    ctx?.revert();
    ctx = null;
  });
}
