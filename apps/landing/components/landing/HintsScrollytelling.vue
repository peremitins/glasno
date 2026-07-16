<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { useNuxtApp } from 'nuxt/app';
  import { gsap } from 'gsap';
  import { CheckIcon, ReloadIcon } from '@radix-icons/vue';
  import { useLandingContent } from '@/composables/useLandingContent';

  const { hints } = useLandingContent();
  const nuxtApp = useNuxtApp();

  const root = ref<HTMLElement | null>(null);
  const inner = ref<HTMLElement | null>(null);
  let mm: gsap.MatchMedia | null = null;

  onMounted(() => {
    if (nuxtApp.$reducedMotion) return;
    mm = gsap.matchMedia();

    mm.add(
      '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
      () => {
        const ctx = gsap.context(() => {
          const demos = gsap.utils.toArray<HTMLElement>(
            '.hint-demo',
            root.value!
          );
          const candidateDemo = demos[0];
          const interviewerDemo = demos[1];
          if (!candidateDemo || !interviewerDemo) return;

          const candidateSections = gsap.utils.toArray<HTMLElement>(
            '.hint-demo__section',
            candidateDemo
          );
          const interviewerSections = gsap.utils.toArray<HTMLElement>(
            '.hint-demo__section',
            interviewerDemo
          );

          gsap.set(candidateSections, { opacity: 0.24, y: 12 });
          gsap.set(interviewerSections, { opacity: 0.24, y: 12 });
          gsap.set(interviewerDemo, { opacity: 0, y: 24 });

          const timeline = gsap.timeline({
            scrollTrigger: {
              trigger: inner.value,
              start: 'top top+=72',
              end: '+=180%',
              pin: true,
              scrub: 0.8,
              invalidateOnRefresh: true,
              anticipatePin: 1,
            },
          });

          candidateSections.forEach((section) => {
            timeline.to(section, {
              opacity: 1,
              y: 0,
              duration: 0.55,
              ease: 'power2.out',
            });
          });

          timeline
            .to(candidateDemo, {
              opacity: 0,
              y: -24,
              duration: 0.65,
              ease: 'power2.inOut',
            })
            .to(
              interviewerDemo,
              {
                opacity: 1,
                y: 0,
                duration: 0.65,
                ease: 'power2.inOut',
              },
              '<'
            );

          interviewerSections.forEach((section) => {
            timeline.to(section, {
              opacity: 1,
              y: 0,
              duration: 0.55,
              ease: 'power2.out',
            });
          });
        }, root.value!);

        return () => ctx.revert();
      }
    );
  });

  onBeforeUnmount(() => mm?.revert());
</script>

<template>
  <section id="hints" ref="root" class="hints">
    <div ref="inner" class="hints__inner l-container">
      <div class="hints__head">
        <p class="hints__eyebrow">
          <span class="hints__dot" aria-hidden="true" />
          {{ hints.eyebrow }}
        </p>
        <h2 class="hints__title">{{ hints.title }}</h2>
        <p class="hints__lead">{{ hints.lead }}</p>
      </div>

      <div class="hints__stage">
        <div class="hints__demos">
          <article
            v-for="mode in hints.modes"
            :key="mode.id"
            class="hint-demo"
            :class="`hint-demo--${mode.id}`"
          >
            <header class="hint-demo__head">
              <span class="hint-demo__mode-dot" aria-hidden="true" />
              <strong>{{ mode.label }}</strong>
            </header>

            <div class="hint-demo__context">
              <span class="hint-demo__label">{{ mode.contextLabel }}</span>
              <p>{{ mode.context }}</p>
            </div>

            <div class="hint-demo__sections">
              <section
                v-for="section in mode.sections"
                :key="section.label"
                class="hint-demo__section"
              >
                <span class="hint-demo__check" aria-hidden="true">
                  <CheckIcon />
                </span>
                <div>
                  <span class="hint-demo__label hint-demo__label--warm">
                    {{ section.label }}
                  </span>
                  <p>{{ section.text }}</p>
                </div>
              </section>
            </div>
          </article>
        </div>

        <p class="hints__note">
          <ReloadIcon aria-hidden="true" />
          <span>{{ hints.note }}</span>
        </p>
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
    grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
    gap: clamp(32px, 6vw, 88px);
    align-items: normal;
  }

  .hints__head {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 42ch;
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
    box-shadow: 0 0 14px color-mix(in oklch, var(--l-warm) 35%, transparent);
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
    min-width: 0;
  }

  .hints__demos {
    display: grid;
  }

  .hint-demo {
    grid-area: 1 / 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: clamp(22px, 3vw, 34px);
    border-radius: var(--l-r-xl);
    border: 1px solid var(--l-line);
    background: var(--l-bg-elevated);
    box-shadow: var(--l-shadow);
  }

  .hint-demo--candidate {
    border-color: var(--l-line-warm);
  }

  .hint-demo__head {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--l-fs-sm);
    color: var(--l-text-soft);
  }

  .hint-demo__mode-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--l-warm);
  }

  .hint-demo--interviewer .hint-demo__mode-dot {
    background: var(--l-cool);
  }

  .hint-demo__context {
    padding: 18px 20px;
    border-radius: var(--l-r-lg);
    border: 1px solid var(--l-line);
    background: var(--l-bg);
  }

  .hint-demo__context p {
    font-size: var(--l-fs-h3);
    font-weight: 500;
    line-height: 1.35;
  }

  .hint-demo__label {
    display: block;
    margin-bottom: 7px;
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
  }

  .hint-demo__label--warm {
    color: var(--l-warm);
  }

  .hint-demo__sections {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .hint-demo__section {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    padding: 14px 16px;
    border-radius: var(--l-r);
    border: 1px solid var(--l-line);
    background: var(--l-surface);
  }

  .hint-demo__section p {
    color: var(--l-text-soft);
  }

  .hint-demo__check {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    margin-top: 2px;
    border-radius: 50%;
    color: var(--l-warm-ink);
    background: var(--l-warm);
  }

  .hint-demo__check svg {
    width: 13px;
    height: 13px;
  }

  .hints__note {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-top: 16px;
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
  }

  .hints__note svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    margin-top: 3px;
    color: var(--l-cool);
  }

  @media (min-width: 900px) and (prefers-reduced-motion: no-preference) {
    .hint-demo--interviewer {
      opacity: 0;
    }
  }

  @media (max-width: 899px) {
    .hints__inner {
      grid-template-columns: 1fr;
      gap: 40px;
      align-items: start;
    }
    .hints__demos {
      grid-template-columns: 1fr;
      gap: 18px;
    }
    .hint-demo {
      grid-area: auto;
    }
    .hint-demo__sections {
      grid-template-columns: 1fr;
    }
  }

  @media (min-width: 900px) and (prefers-reduced-motion: reduce) {
    .hints__inner {
      grid-template-columns: 1fr;
      align-items: start;
    }
    .hints__demos {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .hint-demo {
      grid-area: auto;
    }
  }
</style>
