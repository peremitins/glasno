<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { useNuxtApp } from 'nuxt/app';
  import { gsap } from 'gsap';
  import {
    BarChartIcon,
    ChatBubbleIcon,
    FilePlusIcon,
  } from '@radix-icons/vue';
  import { useLandingContent } from '@/composables/useLandingContent';

  const { stepsHead, steps } = useLandingContent();
  const nuxtApp = useNuxtApp();

  const icons = [FilePlusIcon, ChatBubbleIcon, BarChartIcon];

  const root = ref<HTMLElement | null>(null);
  const viewport = ref<HTMLElement | null>(null);
  const track = ref<HTMLElement | null>(null);

  let mm: gsap.MatchMedia | null = null;

  onMounted(() => {
    if (nuxtApp.$reducedMotion) return;
    mm = gsap.matchMedia();

    mm.add('(min-width: 900px)', () => {
      const trackEl = track.value;
      const vpEl = viewport.value;
      if (!trackEl || !vpEl) return;

      const distance = () => trackEl.scrollWidth - vpEl.clientWidth;

      const tween = gsap.to(trackEl, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: vpEl,
          start: 'top top',
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });

      return () => tween.kill();
    });
  });

  onBeforeUnmount(() => mm?.revert());
</script>

<template>
  <section id="how" ref="root" class="hiw">
    <div class="hiw__head l-container">
      <SectionHeading :eyebrow="stepsHead.eyebrow" :title="stepsHead.title" />
    </div>

    <div ref="viewport" class="hiw__viewport">
      <div ref="track" class="hiw__track">
        <article
          v-for="(step, i) in steps"
          :key="step.index"
          class="hiw__panel"
          :class="{ 'hiw__panel--accent': i === 1 }"
          data-reveal
        >
          <span class="hiw__num" aria-hidden="true">{{ step.index }}</span>
          <span class="hiw__icon">
            <component :is="icons[i]" aria-hidden="true" />
          </span>
          <h3 class="hiw__title">{{ step.title }}</h3>
          <p class="hiw__text">{{ step.text }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
  .hiw {
    padding-block: var(--l-section-y);
  }

  .hiw__head {
    margin-bottom: clamp(36px, 5vw, 64px);
  }

  .hiw__viewport {
    overflow: hidden;
  }
  @media (min-width: 900px) {
    /* pinned-область на весь экран, панели по центру вертикали */
    .hiw__viewport {
      min-height: 100vh;
      display: flex;
      align-items: center;
    }
  }

  .hiw__track {
    display: flex;
    gap: clamp(18px, 2vw, 28px);
    padding-inline: var(--l-gutter);
    will-change: transform;
  }

  .hiw__panel {
    position: relative;
    flex: 0 0 auto;
    width: clamp(280px, 78vw, 560px);
    min-height: clamp(340px, 52vh, 460px);
    display: flex;
    flex-direction: column;
    padding: clamp(26px, 3vw, 44px);
    border-radius: var(--l-r-xl);
    border: 1px solid var(--l-line);
    background: var(--l-bg-elevated);
    overflow: hidden;
  }

  .hiw__panel--accent {
    border-color: var(--l-line-warm);
    background:
      radial-gradient(
        120% 80% at 80% 0%,
        oklch(0.77 0.155 58 / 0.12),
        transparent 60%
      ),
      var(--l-bg-elevated);
  }

  .hiw__num {
    position: absolute;
    top: clamp(-8px, 1vw, 6px);
    right: clamp(14px, 2vw, 30px);
    font-size: clamp(6rem, 12vw, 11rem);
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.04em;
    color: oklch(1 0 0 / 0.04);
    pointer-events: none;
  }

  .hiw__icon {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: var(--l-r);
    border: 1px solid var(--l-line-hi);
    background: oklch(1 0 0 / 0.03);
    color: var(--l-warm);
    margin-bottom: auto;
  }
  .hiw__icon svg {
    width: 24px;
    height: 24px;
  }

  .hiw__title {
    margin-top: 28px;
    font-size: var(--l-fs-h3);
    font-weight: 600;
  }

  .hiw__text {
    margin-top: 12px;
    max-width: 42ch;
    font-size: var(--l-fs-body);
    color: var(--l-text-soft);
  }

  /* Мобайл: обычный вертикальный стек, без горизонтального pin */
  @media (max-width: 899px) {
    .hiw__track {
      flex-direction: column;
    }
    .hiw__panel {
      width: 100%;
      min-height: 0;
    }
    .hiw__num {
      font-size: 6rem;
    }
  }
</style>
