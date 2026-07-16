<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { useNuxtApp } from 'nuxt/app';
  import { useYandexMetrika } from '#imports';
  import { gsap } from 'gsap';
  import { ArrowRightIcon, PlayIcon } from '@radix-icons/vue';
  import { useLandingContent } from '@/composables/useLandingContent';
  import { useLandingAppAuthUrl } from '@/composables/useLandingAppAuthUrl';
  import { useScrollTo } from '@/composables/useMotion';
  import { YandexMetrikaGoal } from '../../../../shared/analytics/yandexMetrika';

  const { hero } = useLandingContent();
  const appAuthUrl = useLandingAppAuthUrl();
  const scrollTo = useScrollTo();
  const nuxtApp = useNuxtApp();
  const { reachGoal } = useYandexMetrika();

  function trackAppOpen() {
    reachGoal(YandexMetrikaGoal.landingAppOpen, {});
  }

  const root = ref<HTMLElement | null>(null);

  // Детерминированная «голосовая волна» (SSR-safe: без Math.random в рендере).
  const bars = Array.from({ length: 72 }, (_, i) => {
    const t = i / 71;
    const envelope = Math.sin(t * Math.PI); // горка к центру
    const wave = 0.5 + 0.5 * Math.sin(t * 22) * Math.sin(t * 7 + 1);
    return Math.max(0.14, envelope * (0.35 + 0.65 * wave));
  });

  let ctx: gsap.Context | null = null;

  onMounted(() => {
    if (nuxtApp.$reducedMotion || !root.value) return;
    ctx = gsap.context(() => {
      // Появление контента (селектор-строки авто-скопятся контекстом)
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.hero__eyebrow', { opacity: 0, y: 18, duration: 0.6 }, 0.1)
        .from('.hero__lead', { opacity: 0, y: 20, duration: 0.7 }, 0.35)
        .from(
          '.hero__actions > *, .hero__note',
          { opacity: 0, y: 20, duration: 0.6, stagger: 0.1 },
          0.5
        )
        .from('.hero__wave', { opacity: 0, duration: 1 }, 0.4);

      // Parallax свечений на скролле
      gsap.to('.hero__glow--warm', {
        yPercent: 26,
        ease: 'none',
        scrollTrigger: {
          trigger: root.value,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });
      gsap.to('.hero__glow--cool', {
        yPercent: -20,
        ease: 'none',
        scrollTrigger: {
          trigger: root.value,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });
    }, root.value);
  });

  onBeforeUnmount(() => ctx?.revert());
</script>

<template>
  <section id="top" ref="root" class="hero">
    <div class="hero__glow hero__glow--warm" aria-hidden="true" />
    <div class="hero__glow hero__glow--cool" aria-hidden="true" />
    <div class="hero__grid" aria-hidden="true" />

    <div class="hero__inner l-container">
      <p class="hero__eyebrow">
        <span class="hero__eyebrow-dot" aria-hidden="true" />
        {{ hero.eyebrow }}
      </p>

      <RevealHeading :text="hero.title" tag="h1" class="hero__title" />

      <p class="hero__lead">{{ hero.lead }}</p>

      <div class="hero__cta">
        <div class="hero__actions">
          <a
            class="l-btn l-btn--primary l-btn--lg"
            :href="appAuthUrl"
            @click="trackAppOpen"
          >
            <span>{{ hero.primaryCta }}</span>
            <ArrowRightIcon aria-hidden="true" />
          </a>
          <button
            class="l-btn l-btn--ghost l-btn--lg"
            type="button"
            @click="scrollTo('#how', -70)"
          >
            <PlayIcon aria-hidden="true" />
            <span>{{ hero.secondaryCta }}</span>
          </button>
        </div>

        <p class="hero__note">Первое интервью бесплатно. Карта не нужна.</p>
      </div>

      <div class="hero__wave" aria-hidden="true">
        <span
          v-for="(h, i) in bars"
          :key="i"
          :style="{ height: `${(h * 100).toFixed(1)}%`, animationDelay: `${(i * 34) % 2200}ms` }"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
  .hero {
    position: relative;
    overflow: hidden;
    padding-top: clamp(120px, 20vh, 200px);
    padding-bottom: clamp(60px, 9vh, 110px);
    isolation: isolate;
  }

  .hero__glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(20px);
    z-index: -1;
    pointer-events: none;
  }
  .hero__glow--warm {
    top: -12%;
    right: -6%;
    width: min(52vw, 620px);
    aspect-ratio: 1;
    background: var(--l-glow-warm);
  }
  .hero__glow--cool {
    bottom: -20%;
    left: -10%;
    width: min(46vw, 540px);
    aspect-ratio: 1;
    background: var(--l-glow-cool);
  }

  .hero__grid {
    position: absolute;
    inset: 0;
    z-index: -1;
    background-image:
      linear-gradient(oklch(1 0 0 / 0.028) 1px, transparent 1px),
      linear-gradient(90deg, oklch(1 0 0 / 0.028) 1px, transparent 1px);
    background-size: 64px 64px;
    mask-image: radial-gradient(circle at 50% 30%, #000 10%, transparent 72%);
  }

  .hero__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .hero__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 6px 14px 6px 12px;
    border-radius: var(--l-r-pill);
    border: 1px solid var(--l-line);
    background: oklch(1 0 0 / 0.03);
    font-size: var(--l-fs-sm);
    color: var(--l-text-soft);
    margin-bottom: 28px;
  }
  .hero__eyebrow-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--l-warm);
    box-shadow: 0 0 10px 1px oklch(0.77 0.155 58 / 0.7);
  }

  .hero__title {
    font-size: var(--l-fs-display);
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.04;
    max-width: 15ch;
    overflow-wrap: break-word;
    hyphens: auto;
  }

  .hero__lead {
    margin-top: 26px;
    max-width: 56ch;
    font-size: var(--l-fs-lead);
    line-height: 1.6;
    color: var(--l-text-soft);
  }

  .hero__cta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    margin-top: 38px;
  }

  .hero__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 14px;
  }

  .hero__note {
    font-size: var(--l-fs-sm);
    color: var(--l-text-dim);
  }

  .hero__wave {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    width: min(100%, 760px);
    height: clamp(70px, 12vh, 130px);
    margin-top: clamp(48px, 8vh, 92px);
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
    mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
  }
  .hero__wave span {
    flex: 1;
    min-width: 2px;
    border-radius: var(--l-r-pill);
    background: linear-gradient(
      to top,
      var(--l-warm-solid),
      var(--l-warm) 70%,
      var(--l-cool)
    );
    opacity: 0.85;
    transform-origin: center;
    animation: hero-bar 2.2s var(--l-ease-io) infinite;
  }

  @keyframes hero-bar {
    0%,
    100% {
      transform: scaleY(0.55);
      opacity: 0.55;
    }
    50% {
      transform: scaleY(1);
      opacity: 0.95;
    }
  }

  @media (max-width: 720px) {
    .hero {
      padding-top: clamp(104px, 16vh, 140px);
    }
    .hero__title {
      max-width: 100%;
      letter-spacing: -0.02em;
    }
    .hero__lead {
      margin-top: 20px;
    }
    .hero__actions {
      width: 100%;
      flex-direction: column;
    }
    .hero__cta {
      width: 100%;
    }
    .hero__actions > * {
      width: 100%;
    }
  }
</style>
