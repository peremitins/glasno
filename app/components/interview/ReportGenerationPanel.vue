<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ButtonLoader from '@/app/components/design/ButtonLoader.vue';

withDefaults(
  defineProps<{
    errorMessage?: string | null;
    retryLoading?: boolean;
  }>(),
  {
    retryLoading: false,
  }
);

defineEmits<{
  (event: 'retry'): void;
}>();

const { t } = useI18n();

const generationSteps = [
  'interview.session.reportGeneration.steps.answers',
  'interview.session.reportGeneration.steps.criteria',
  'interview.session.reportGeneration.steps.recommendations',
];
</script>

<template>
  <section
    class="report-generation panel glass-frame"
    :class="{ 'report-generation--error': errorMessage }"
    aria-live="polite"
  >
    <div class="report-generation__visual" aria-hidden="true">
      <span class="report-generation__ring"/>
      <span class="report-generation__ring report-generation__ring--slow"/>
      <span class="report-generation__core"/>
    </div>

    <div class="report-generation__content">
      <p class="page-kicker">{{ t('interview.session.reportGeneration.eyebrow') }}</p>
      <h2>
        {{
          errorMessage
            ? t('interview.session.reportGeneration.errorTitle')
            : t('interview.session.reportGeneration.title')
        }}
      </h2>
      <p>
        {{
          errorMessage
            ? t('interview.session.reportGeneration.errorSubtitle')
            : t('interview.session.reportGeneration.subtitle')
        }}
      </p>

      <ol class="report-generation__steps">
        <li
          v-for="(step, index) in generationSteps"
          :key="step"
          :style="{ '--step-index': index }"
        >
          <span/>
          {{ t(step) }}
        </li>
      </ol>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <button
        v-if="errorMessage"
        type="button"
        class="secondary-action secondary-action--compact button-loader-host"
        :disabled="retryLoading"
        @click="$emit('retry')"
      >
        <ButtonLoader v-if="retryLoading" />
        <span
          class="button-loader-content"
          :class="{ 'button-loader-content--loading': retryLoading }"
        >
          {{ t('interview.session.reportGeneration.retry') }}
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.report-generation {
  display: grid;
  grid-template-columns: minmax(150px, 0.34fr) minmax(0, 1fr);
  gap: clamp(18px, 3vw, 34px);
  align-items: center;
  min-height: clamp(260px, 36vh, 390px);
  padding: clamp(20px, 3vw, 34px);
}

.report-generation__visual {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 190px;
}

.report-generation__ring,
.report-generation__core {
  position: absolute;
  border-radius: 999px;
}

.report-generation__ring {
  width: 150px;
  height: 150px;
  border: 1px solid color-mix(in srgb, var(--accent-2) 56%, transparent);
  box-shadow: inset 0 0 34px color-mix(in srgb, var(--accent) 16%, transparent);
  animation: report-orbit 3.8s var(--ease-out) infinite;
}

.report-generation__ring::before,
.report-generation__ring::after {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: inherit;
  background: var(--accent-2);
  box-shadow: 0 0 18px color-mix(in srgb, var(--accent-2) 72%, transparent);
}

.report-generation__ring::before {
  top: 18px;
  right: 20px;
}

.report-generation__ring::after {
  left: 20px;
  bottom: 22px;
  background: var(--accent);
}

.report-generation__ring--slow {
  width: 112px;
  height: 112px;
  border-color: color-mix(in srgb, var(--accent) 52%, transparent);
  animation-duration: 5.4s;
  animation-direction: reverse;
}

.report-generation__core {
  width: 72px;
  height: 72px;
  background:
    radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.78), transparent 28%),
    linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.42),
    0 18px 40px color-mix(in srgb, var(--accent) 28%, transparent);
  animation: report-core-pulse 1.8s var(--ease-out) infinite;
}

.report-generation__content {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.report-generation__content h2,
.report-generation__content p {
  margin: 0;
}

.report-generation__content h2 {
  color: var(--text-primary);
  font-size: clamp(22px, 2.4vw, 32px);
  line-height: 1.05;
}

.report-generation__content > p:not(.page-kicker):not(.error) {
  max-width: 58ch;
  color: var(--text-secondary);
  line-height: 1.55;
}

.report-generation__steps {
  display: grid;
  gap: 10px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.report-generation__steps li {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-weight: 800;
  animation: report-step-pulse 1.8s var(--ease-out) infinite;
  animation-delay: calc(var(--step-index) * 180ms);
}

.report-generation__steps span {
  position: relative;
  flex: 0 0 36px;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-muted) 22%, transparent);
}

.report-generation__steps span::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, var(--accent-2), transparent);
  animation: report-shimmer 1.6s var(--ease-out) infinite;
  animation-delay: calc(var(--step-index) * 180ms);
}

.report-generation--error .report-generation__ring,
.report-generation--error .report-generation__core,
.report-generation--error .report-generation__steps li,
.report-generation--error .report-generation__steps span::after {
  animation-play-state: paused;
}

.error {
  color: var(--danger);
  font-weight: 800;
}

@keyframes report-orbit {
  0% {
    transform: rotate(0deg) scale(0.96);
    opacity: 0.72;
  }
  50% {
    transform: rotate(180deg) scale(1.04);
    opacity: 1;
  }
  100% {
    transform: rotate(360deg) scale(0.96);
    opacity: 0.72;
  }
}

@keyframes report-core-pulse {
  0%,
  100% {
    transform: scale(0.94);
    opacity: 0.84;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes report-step-pulse {
  0%,
  100% {
    opacity: 0.58;
  }
  50% {
    opacity: 1;
  }
}

@keyframes report-shimmer {
  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .report-generation__ring,
  .report-generation__core,
  .report-generation__steps li,
  .report-generation__steps span::after {
    animation: none;
  }
}

@media (max-width: 760px) {
  .report-generation {
    grid-template-columns: 1fr;
  }

  .report-generation__visual {
    min-height: 150px;
  }

  .report-generation__ring {
    width: 128px;
    height: 128px;
  }

  .report-generation__ring--slow {
    width: 96px;
    height: 96px;
  }
}
</style>
