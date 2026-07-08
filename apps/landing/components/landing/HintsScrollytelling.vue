<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { useNuxtApp } from 'nuxt/app';
  import { gsap } from 'gsap';
  import { CheckIcon, LockClosedIcon } from '@radix-icons/vue';
  import { useLandingContent } from '@/composables/useLandingContent';

  const { hints } = useLandingContent();
  const nuxtApp = useNuxtApp();

  const root = ref<HTMLElement | null>(null);
  const inner = ref<HTMLElement | null>(null);
  let mm: gsap.MatchMedia | null = null;

  onMounted(() => {
    if (nuxtApp.$reducedMotion) return;
    mm = gsap.matchMedia();

    mm.add('(min-width: 900px)', () => {
      const ctx = gsap.context(() => {
        const points = gsap.utils.toArray<HTMLElement>('.hint-item', root.value!);
        const honesty = gsap.utils.toArray<HTMLElement>(
          '.hint-demo__honesty',
          root.value!
        );

        gsap.set([...points, ...honesty], { opacity: 0.2, y: 12 });

        const tl = gsap.timeline({
          scrollTrigger: {
            // пиним всю сетку: левый заголовок и правая панель заморожены,
            // пока по скроллу проявляются подсказки
            trigger: inner.value,
            start: 'top top+=80',
            end: '+=150%',
            pin: true,
            scrub: 0.8,
            invalidateOnRefresh: true,
          },
        });
        points.forEach((p) => tl.to(p, { opacity: 1, y: 0, ease: 'power2.out' }));
        tl.to(honesty, { opacity: 1, y: 0, ease: 'power2.out' }, '+=0.3');
      }, root.value!);

      return () => ctx.revert();
    });
  });

  onBeforeUnmount(() => mm?.revert());
</script>

<template>
  <section id="hints" ref="root" class="hints">
    <div ref="inner" class="hints__inner l-container">
      <!-- Статичный заголовок: он внутри pinned-зоны, поэтому без reveal/split -->
      <div class="hints__head">
        <p class="hints__eyebrow">
          <span class="hints__dot" aria-hidden="true" />
          {{ hints.eyebrow }}
        </p>
        <h2 class="hints__title">{{ hints.title }}</h2>
        <p class="hints__lead">{{ hints.lead }}</p>
      </div>

      <div class="hints__stage">
        <div class="hint-demo">
          <div class="hint-demo__q">
            <span class="hint-demo__label">{{ hints.exampleLabel }}</span>
            <p>{{ hints.exampleQuestion }}</p>
          </div>

          <div class="hint-demo__panel">
            <span class="hint-demo__label hint-demo__label--warm">
              {{ hints.hintLabel }}
            </span>
            <ul class="hint-demo__list">
              <li
                v-for="(point, i) in hints.hintPoints"
                :key="i"
                class="hint-item"
              >
                <CheckIcon aria-hidden="true" />
                <span>{{ point }}</span>
              </li>
            </ul>
          </div>

          <p class="hint-demo__honesty">
            <LockClosedIcon aria-hidden="true" />
            <span>{{ hints.honesty }}</span>
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
  .hints {
    padding-block: var(--l-section-y);
  }

  .hints__inner {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: clamp(32px, 6vw, 88px);
    align-items: center;
  }

  .hints__head {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 40ch;
  }
  .hints__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
  }
  .hints__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--l-warm);
    box-shadow: 0 0 0 4px oklch(0.77 0.155 58 / 0.16);
  }
  .hints__title {
    font-size: var(--l-fs-h2);
    font-weight: 600;
  }
  .hints__lead {
    font-size: var(--l-fs-lead);
    line-height: 1.6;
    color: var(--l-text-soft);
  }

  .hints__stage {
    display: flex;
  }

  .hint-demo {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: clamp(22px, 3vw, 36px);
    border-radius: var(--l-r-xl);
    border: 1px solid var(--l-line);
    background: var(--l-bg-elevated);
    box-shadow: var(--l-shadow);
  }

  .hint-demo__label {
    display: inline-block;
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
    margin-bottom: 10px;
  }
  .hint-demo__label--warm {
    color: var(--l-warm);
  }

  .hint-demo__q p {
    font-size: var(--l-fs-h3);
    font-weight: 500;
    line-height: 1.35;
  }

  .hint-demo__panel {
    padding: 20px;
    border-radius: var(--l-r-lg);
    border: 1px solid var(--l-line-warm);
    background: radial-gradient(
        140% 100% at 100% 0%,
        oklch(0.77 0.155 58 / 0.08),
        transparent 60%
      ),
      oklch(1 0 0 / 0.02);
  }

  .hint-demo__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .hint-item {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    font-size: var(--l-fs-body);
    color: var(--l-text-soft);
  }
  .hint-item svg {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    margin-top: 2px;
    padding: 2px;
    border-radius: 50%;
    color: var(--l-warm-ink);
    background: var(--l-warm);
  }

  .hint-demo__honesty {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
    padding-top: 4px;
  }
  .hint-demo__honesty svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    margin-top: 3px;
    color: var(--l-cool);
  }

  @media (max-width: 899px) {
    .hints__inner {
      grid-template-columns: 1fr;
      gap: 40px;
      align-items: start;
    }
  }
</style>
