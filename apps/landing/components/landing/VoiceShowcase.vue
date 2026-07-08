<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { useNuxtApp } from 'nuxt/app';
  import { gsap } from 'gsap';
  import { useLandingContent } from '@/composables/useLandingContent';

  const { voice } = useLandingContent();
  const nuxtApp = useNuxtApp();

  // Статичная волна для постера (SSR-safe).
  const posterBars = Array.from({ length: 40 }, (_, i) => {
    const t = i / 39;
    return Math.max(0.18, 0.5 + 0.5 * Math.sin(t * 15) * Math.sin(t * 5 + 2));
  });

  const stage = ref<HTMLElement | null>(null);
  let ctx: gsap.Context | null = null;

  onMounted(() => {
    if (nuxtApp.$reducedMotion || !stage.value) return;
    ctx = gsap.context(() => {
      gsap.from(stage.value, {
        scale: 0.94,
        opacity: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: { trigger: stage.value, start: 'top 82%', once: true },
      });
    }, stage.value);
  });

  onBeforeUnmount(() => ctx?.revert());
</script>

<template>
  <section id="voice" class="vsc">
    <div class="vsc__glow" aria-hidden="true" />
    <div class="vsc__inner l-container">
      <SectionHeading
        :eyebrow="voice.eyebrow"
        :title="voice.title"
        :lead="voice.lead"
        align="center"
      />

      <div ref="stage" class="vsc__stage" data-reveal>
        <VideoPlayer
          :src="voice.videoSrc"
          :caption="voice.videoCaption"
          :sound-hint="voice.soundOnHint"
          aspect="16 / 9"
        >
          <template #poster>
            <div class="poster">
              <div class="poster__glow" aria-hidden="true" />
              <div class="poster__top">
                <div class="poster__who">
                  <span class="poster__avatar" aria-hidden="true">И</span>
                  <span class="poster__meta">
                    <strong>Интервьюер</strong>
                    <span>говорит…</span>
                  </span>
                </div>
                <span class="poster__timer l-tnum">08:24</span>
              </div>

              <div class="poster__wave" aria-hidden="true">
                <span
                  v-for="(h, i) in posterBars"
                  :key="i"
                  :style="{ height: `${(h * 100).toFixed(0)}%` }"
                />
              </div>

              <p class="poster__line">
                «Расскажите о задаче, которой вы гордитесь, и что именно вы
                сделали.»
              </p>
            </div>
          </template>
        </VideoPlayer>
      </div>
    </div>
  </section>
</template>

<style scoped>
  .vsc {
    position: relative;
    padding-block: var(--l-section-y);
    overflow: hidden;
  }

  .vsc__glow {
    position: absolute;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    width: min(70vw, 820px);
    aspect-ratio: 2 / 1;
    background: var(--l-glow-warm);
    filter: blur(30px);
    z-index: -1;
    pointer-events: none;
  }

  .vsc__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(40px, 6vw, 72px);
  }

  .vsc__stage {
    width: 100%;
    max-width: 940px;
  }

  /* Постер-кадр интерфейса звонка */
  .poster {
    display: flex;
    flex-direction: column;
    padding: clamp(20px, 3vw, 38px);
    background:
      radial-gradient(
        130% 90% at 50% 0%,
        oklch(0.205 0.014 260),
        oklch(0.13 0.01 260)
      );
  }

  .poster__glow {
    position: absolute;
    top: -10%;
    left: 20%;
    width: 60%;
    aspect-ratio: 1;
    background: var(--l-glow-cool);
    filter: blur(30px);
  }

  .poster__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .poster__who {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .poster__avatar {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    font-weight: 600;
    font-size: 1.2rem;
    color: var(--l-warm-ink);
    background: linear-gradient(150deg, var(--l-warm), var(--l-warm-strong));
    box-shadow: 0 0 0 6px oklch(0.77 0.155 58 / 0.12);
  }
  .poster__meta {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .poster__meta strong {
    font-weight: 600;
  }
  .poster__meta span {
    font-size: var(--l-fs-sm);
    color: var(--l-warm);
  }
  .poster__timer {
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
    padding: 5px 12px;
    border-radius: var(--l-r-pill);
    border: 1px solid var(--l-line);
  }

  .poster__wave {
    display: flex;
    align-items: center;
    gap: 4px;
    height: clamp(60px, 12vw, 120px);
    margin: auto 0;
  }
  .poster__wave span {
    flex: 1;
    border-radius: var(--l-r-pill);
    background: linear-gradient(to top, var(--l-warm-solid), var(--l-warm));
    opacity: 0.9;
  }

  .poster__line {
    font-size: clamp(1rem, 1.6vw, 1.35rem);
    color: var(--l-text);
    max-width: 40ch;
  }
</style>
