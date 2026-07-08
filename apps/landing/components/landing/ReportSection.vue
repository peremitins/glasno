<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { useNuxtApp } from 'nuxt/app';
  import { gsap } from 'gsap';
  import { useLandingContent } from '@/composables/useLandingContent';

  const { report } = useLandingContent();
  const nuxtApp = useNuxtApp();

  const root = ref<HTMLElement | null>(null);
  let ctx: gsap.Context | null = null;

  onMounted(() => {
    if (nuxtApp.$reducedMotion || !root.value) return;
    ctx = gsap.context(() => {
      // селектор-строки авто-скопятся контекстом на root.value
      gsap.from('.metric__fill', {
        scaleX: 0,
        transformOrigin: 'left center',
        duration: 1,
        ease: 'power3.out',
        stagger: 0.1,
        scrollTrigger: { trigger: root.value, start: 'top 78%', once: true },
      });
    }, root.value);
  });

  onBeforeUnmount(() => ctx?.revert());
</script>

<template>
  <section id="report" ref="root" class="report">
    <div class="report__inner l-container">
      <SectionHeading :eyebrow="report.eyebrow" :title="report.title" />

      <div class="report__grid">
        <article class="report__score" data-reveal :style="{ '--p': report.score }">
          <div class="score-ring">
            <div class="score-ring__inner">
              <span class="score-ring__num">
                <AnimatedNumber :value="report.score" />
              </span>
              <small>/100</small>
            </div>
          </div>
          <div class="report__verdict">
            <h3>{{ report.verdict }}</h3>
            <p>{{ report.scoreNote }}</p>
          </div>
        </article>

        <article class="report__metrics" data-reveal>
          <div v-for="m in report.metrics" :key="m.label" class="metric">
            <div class="metric__head">
              <span>{{ m.label }}</span>
              <strong class="l-tnum">{{ m.value }}</strong>
            </div>
            <div class="metric__track">
              <span
                class="metric__fill"
                :class="{ 'metric__fill--low': m.value < 70 }"
                :style="{ width: `${m.value}%` }"
              />
            </div>
          </div>
        </article>
      </div>

      <div class="report__fixes" data-reveal>
        <span class="report__fixes-label">{{ report.fixesLabel }}</span>
        <ol>
          <li v-for="(fix, i) in report.fixes" :key="i">
            <span class="report__fix-num l-tnum">{{ i + 1 }}</span>
            <span>{{ fix }}</span>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
  .report {
    padding-block: var(--l-section-y);
  }

  .report__inner {
    display: flex;
    flex-direction: column;
    gap: clamp(36px, 5vw, 60px);
  }

  .report__grid {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    gap: clamp(18px, 2.5vw, 28px);
  }

  .report__score {
    display: flex;
    flex-direction: column;
    gap: 26px;
    padding: clamp(26px, 3vw, 40px);
    border-radius: var(--l-r-xl);
    border: 1px solid var(--l-line-warm);
    background: radial-gradient(
        120% 90% at 0% 0%,
        oklch(0.77 0.155 58 / 0.1),
        transparent 55%
      ),
      var(--l-bg-elevated);
  }

  .score-ring {
    width: clamp(130px, 16vw, 168px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: conic-gradient(
      from -90deg,
      var(--l-warm) calc(var(--p) * 1%),
      oklch(1 0 0 / 0.08) 0
    );
    display: grid;
    place-items: center;
  }
  .score-ring__inner {
    width: 78%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--l-bg-elevated);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .score-ring__num {
    font-size: clamp(2.4rem, 4vw, 3.2rem);
    font-weight: 700;
    letter-spacing: -0.03em;
  }
  .score-ring__inner small {
    color: var(--l-text-mut);
    font-size: var(--l-fs-sm);
    margin-top: 4px;
  }

  .report__verdict h3 {
    font-size: var(--l-fs-h3);
    font-weight: 600;
  }
  .report__verdict p {
    margin-top: 8px;
    color: var(--l-text-soft);
  }

  .report__metrics {
    display: flex;
    flex-direction: column;
    gap: 22px;
    justify-content: center;
    padding: clamp(26px, 3vw, 40px);
    border-radius: var(--l-r-xl);
    border: 1px solid var(--l-line);
    background: var(--l-bg-elevated);
  }
  .metric__head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 9px;
  }
  .metric__head span {
    color: var(--l-text-soft);
  }
  .metric__head strong {
    font-weight: 600;
  }
  .metric__track {
    height: 8px;
    border-radius: var(--l-r-pill);
    background: oklch(1 0 0 / 0.06);
    overflow: hidden;
  }
  .metric__fill {
    display: block;
    height: 100%;
    border-radius: var(--l-r-pill);
    background: linear-gradient(90deg, var(--l-warm-strong), var(--l-warm));
  }
  .metric__fill--low {
    background: linear-gradient(90deg, var(--l-warm-strong), var(--l-danger));
  }

  .report__fixes {
    padding: clamp(24px, 3vw, 36px);
    border-radius: var(--l-r-xl);
    border: 1px solid var(--l-line);
    background: var(--l-bg-deep);
  }
  .report__fixes-label {
    display: block;
    font-size: var(--l-fs-sm);
    color: var(--l-warm);
    margin-bottom: 20px;
  }
  .report__fixes ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: clamp(18px, 2.5vw, 32px);
  }
  .report__fixes li {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: var(--l-fs-body);
    color: var(--l-text-soft);
  }
  .report__fix-num {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    font-weight: 600;
    color: var(--l-warm);
    border: 1px solid var(--l-line-warm);
  }

  @media (max-width: 899px) {
    .report__grid {
      grid-template-columns: 1fr;
    }
    .report__score {
      flex-direction: row;
      align-items: center;
    }
    .report__fixes ol {
      grid-template-columns: 1fr;
      gap: 20px;
    }
  }
  @media (max-width: 520px) {
    .report__score {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
