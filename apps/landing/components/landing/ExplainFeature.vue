<script setup lang="ts">
  import { MagicWandIcon } from '@radix-icons/vue';
  import { useLandingContent } from '@/composables/useLandingContent';

  const { explain } = useLandingContent();
</script>

<template>
  <section id="explain" class="xpl">
    <div class="xpl__glow" aria-hidden="true" />
    <div class="xpl__inner l-container">
      <div class="xpl__copy">
        <SectionHeading
          :eyebrow="explain.eyebrow"
          :title="explain.title"
          :lead="explain.lead"
        />
      </div>

      <div class="xpl__stage" data-reveal>
        <VideoPlayer
          :src="explain.videoSrc"
          :caption="explain.videoCaption"
          sound-hint="Включите звук"
          :show-sound-control="false"
          aspect="2076 / 1080"
          hide-soon
        >
          <template #poster>
            <div class="xpl-poster">
              <p class="xpl-poster__q">
                Как вы считали<!--
                --> <span class="xpl-word">
                  <button class="xpl-word__btn" type="button" tabindex="-1">
                    <MagicWandIcon aria-hidden="true" />
                    {{ explain.explainButton }}
                  </button>
                  {{ explain.demoWord }}</span>?
              </p>

              <div class="xpl-poster__panel">
                <span class="xpl-poster__label">
                  <MagicWandIcon aria-hidden="true" />
                  {{ explain.explanationLabel }}
                </span>
                <p>{{ explain.explanation }}</p>
              </div>
            </div>
          </template>
        </VideoPlayer>
      </div>
    </div>
  </section>
</template>

<style scoped>
  .xpl {
    position: relative;
    padding-block: var(--l-section-y);
    overflow: hidden;
  }
  .xpl__glow {
    position: absolute;
    top: 30%;
    right: -8%;
    width: min(46vw, 520px);
    aspect-ratio: 1;
    background: var(--l-glow-cool);
    filter: blur(30px);
    z-index: -1;
  }

  .xpl__inner {
    display: grid;
    grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
    gap: clamp(32px, 5vw, 72px);
    align-items: center;
  }

  .xpl__copy,
  .xpl__stage {
    min-width: 0;
  }

  .xpl__copy {
    position: sticky;
    top: 100px;
  }

  /* Постер-кадр фичи: предложение сверху, панель снизу, центр свободен под play */
  .xpl-poster {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 20px;
    padding: clamp(30px, 4vw, 52px) clamp(22px, 3.5vw, 46px)
      clamp(22px, 3vw, 40px);
  }

  .xpl-poster__q {
    font-size: clamp(1.05rem, 2vw, 1.75rem);
    font-weight: 500;
    line-height: 1.5;
    color: var(--l-text);
    /* запас сверху для всплывающей кнопки «Объяснить» */
    padding-top: 26px;
  }

  .xpl-word {
    position: relative;
    white-space: nowrap;
    color: var(--l-warm);
    background: oklch(0.77 0.155 58 / 0.16);
    border-bottom: 2px solid var(--l-warm);
    border-radius: 4px;
    padding: 0 4px;
  }

  /* Всплывающая кнопка «Объяснить» над выделенным словом */
  .xpl-word__btn {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 13px;
    white-space: nowrap;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--l-warm-ink);
    background: var(--l-warm);
    border: 0;
    border-radius: var(--l-r-pill);
    box-shadow: var(--l-shadow-warm);
    cursor: default;
  }
  .xpl-word__btn svg {
    width: 14px;
    height: 14px;
  }
  .xpl-word__btn::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--l-warm);
  }

  .xpl-poster__panel {
    padding: 18px 20px;
    border-radius: var(--l-r-lg);
    border: 1px solid var(--l-line);
    background: oklch(0.145 0.01 260 / 0.85);
    backdrop-filter: blur(4px);
  }
  .xpl-poster__label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: var(--l-fs-sm);
    color: var(--l-cool);
    margin-bottom: 8px;
  }
  .xpl-poster__label svg {
    width: 15px;
    height: 15px;
  }
  .xpl-poster__panel p {
    color: var(--l-text-soft);
    line-height: 1.5;
    font-size: var(--l-fs-sm);
  }

  @media (max-width: 899px) {
    .xpl__inner {
      grid-template-columns: minmax(0, 1fr);
      gap: 36px;
    }
    .xpl__copy {
      position: static;
    }
  }
</style>
