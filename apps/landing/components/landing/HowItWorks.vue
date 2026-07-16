<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, type Component } from 'vue';
  import { useNuxtApp } from 'nuxt/app';
  import { gsap } from 'gsap';
  import {
    BarChartIcon,
    ChatBubbleIcon,
    FileTextIcon,
    MixerHorizontalIcon,
    PersonIcon,
  } from '@radix-icons/vue';
  import {
    useLandingContent,
    type Step,
  } from '@/composables/useLandingContent';

  const { stepsHead, steps } = useLandingContent();
  const nuxtApp = useNuxtApp();

  const iconById = {
    role: PersonIcon,
    context: FileTextIcon,
    settings: MixerHorizontalIcon,
    interview: ChatBubbleIcon,
    report: BarChartIcon,
  } satisfies Record<Step['icon'], Component>;

  const root = ref<HTMLElement | null>(null);
  const viewport = ref<HTMLElement | null>(null);
  const track = ref<HTMLElement | null>(null);

  let mm: gsap.MatchMedia | null = null;

  onMounted(() => {
    if (nuxtApp.$reducedMotion) return;
    mm = gsap.matchMedia();

    mm.add(
      '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
      () => {
        const trackEl = track.value;
        const vpEl = viewport.value;
        if (!trackEl || !vpEl) return;

        const distance = () =>
          Math.max(0, trackEl.scrollWidth - vpEl.clientWidth);
        const scrollDistance = () =>
          Math.max(distance() * 1.2, window.innerHeight);

        const tween = gsap.to(trackEl, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: vpEl,
            start: 'top top',
            end: () => `+=${scrollDistance()}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            anticipatePin: 1,
          },
        });

        return () => tween.kill();
      }
    );
  });

  onBeforeUnmount(() => mm?.revert());
</script>

<template>
  <section id="how" ref="root" class="hiw">
    <div ref="viewport" class="hiw__viewport">
      <div class="hiw__head l-container">
        <SectionHeading
          :eyebrow="stepsHead.eyebrow"
          :title="stepsHead.title"
        />
      </div>

      <div ref="track" class="hiw__track">
        <article
          v-for="(step, i) in steps"
          :key="step.index"
          class="hiw__panel"
          :class="{ 'hiw__panel--accent': i === 0 }"
          data-reveal
        >
          <span class="hiw__num" aria-hidden="true">{{ step.index }}</span>
          <span class="hiw__icon">
            <component :is="iconById[step.icon]" aria-hidden="true" />
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
    position: relative;
  }

  .hiw__viewport {
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
  }

  @media (min-width: 900px) {
    .hiw__viewport {
      min-height: 100svh;
      display: grid;
      grid-template-rows: auto auto;
      align-content: center;
      gap: clamp(32px, 5vh, 56px);
      padding-block: clamp(76px, 9vh, 108px);
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
    width: clamp(320px, 31vw, 500px);
    min-height: clamp(340px, 42vh, 420px);
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
    .hiw {
      padding-block: var(--l-section-y);
    }
    .hiw__head {
      margin-bottom: 36px;
    }
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

  @media (min-width: 900px) and (prefers-reduced-motion: reduce) {
    .hiw {
      padding-block: var(--l-section-y);
    }
    .hiw__viewport {
      min-height: 0;
      display: block;
      overflow: visible;
      padding-block: 0;
    }
    .hiw__head {
      margin-bottom: clamp(36px, 5vw, 64px);
    }
    .hiw__track {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      will-change: auto;
    }
    .hiw__panel {
      width: auto;
      min-height: 340px;
    }
  }
</style>
