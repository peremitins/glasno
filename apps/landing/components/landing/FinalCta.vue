<script setup lang="ts">
  import { useYandexMetrika } from '#imports';
  import { ArrowRightIcon } from '@radix-icons/vue';
  import { useLandingContent } from '@/composables/useLandingContent';
  import { useLandingAppAuthUrl } from '@/composables/useLandingAppAuthUrl';
  import { YandexMetrikaGoal } from '../../../../shared/analytics/yandexMetrika';

  const { finalCta } = useLandingContent();
  const appAuthUrl = useLandingAppAuthUrl();
  const { reachGoal } = useYandexMetrika();

  function trackAppOpen() {
    reachGoal(YandexMetrikaGoal.landingAppOpen, {});
  }
</script>

<template>
  <section class="cta">
    <div class="cta__inner l-container">
      <div class="cta__card">
        <div class="cta__glow" aria-hidden="true" />
        <p class="cta__eyebrow" data-reveal>
          <span class="cta__dot" aria-hidden="true" />
          {{ finalCta.eyebrow }}
        </p>
        <RevealHeading :text="finalCta.title" tag="h2" class="cta__title" />
        <a
          class="l-btn l-btn--primary l-btn--lg"
          :href="appAuthUrl"
          data-reveal
          @click="trackAppOpen"
        >
          <span>{{ finalCta.cta }}</span>
          <ArrowRightIcon aria-hidden="true" />
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
  .cta {
    padding-block: var(--l-section-y);
  }

  .cta__card {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 26px;
    padding: clamp(48px, 9vw, 110px) clamp(24px, 5vw, 64px);
    border-radius: var(--l-r-xl);
    border: 1px solid var(--l-line-warm);
    background:
      radial-gradient(
        120% 120% at 50% 0%,
        oklch(0.205 0.014 260),
        oklch(0.13 0.01 260)
      );
  }

  .cta__glow {
    position: absolute;
    top: -40%;
    left: 50%;
    transform: translateX(-50%);
    width: min(80%, 700px);
    aspect-ratio: 1;
    background: var(--l-glow-warm);
    filter: blur(40px);
    pointer-events: none;
  }

  .cta__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: var(--l-fs-sm);
    color: var(--l-text-soft);
  }
  .cta__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--l-warm);
    box-shadow: 0 0 10px 1px oklch(0.77 0.155 58 / 0.7);
  }

  .cta__title {
    font-size: var(--l-fs-h1);
    font-weight: 600;
    max-width: 22ch;
  }
</style>
