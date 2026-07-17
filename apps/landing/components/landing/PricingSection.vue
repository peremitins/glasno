<script setup lang="ts">
  import { useYandexMetrika } from '#imports';
  import { ArrowRightIcon, CheckIcon } from '@radix-icons/vue';
  import { useLandingContent } from '@/composables/useLandingContent';
  import { useLandingAppAuthUrl } from '@/composables/useLandingAppAuthUrl';
  import { YandexMetrikaGoal } from '../../../../shared/analytics/yandexMetrika';

  const { pricing } = useLandingContent();
  const appAuthUrl = useLandingAppAuthUrl();
  const { reachGoal } = useYandexMetrika();

  function trackAppOpen() {
    reachGoal(YandexMetrikaGoal.landingAppOpen, {});
  }
</script>

<template>
  <section id="pricing" class="pricing">
    <div class="pricing__inner l-container">
      <SectionHeading
        :eyebrow="pricing.eyebrow"
        :title="pricing.title"
        :lead="pricing.subtitle"
        align="center"
      />

      <div class="pricing__grid">
        <article
          v-for="plan in pricing.plans"
          :key="plan.id"
          class="plan"
          :class="{ 'plan--hi': plan.highlighted }"
          data-reveal
        >
          <div class="plan__head">
            <span
              class="plan__badge"
              :class="{ 'plan__badge--empty': !plan.badge }"
              >{{ plan.badge || '·' }}</span
            >
            <h3 class="plan__name">{{ plan.name }}</h3>
          </div>
          <p class="plan__desc">{{ plan.description }}</p>

          <div class="plan__price">
            <strong class="plan__price-value l-tnum">{{ plan.price }}</strong>
            <span class="plan__price-period">{{ plan.period }}</span>
          </div>

          <a
            class="l-btn plan__cta"
            :class="plan.highlighted ? 'l-btn--primary' : 'l-btn--ghost'"
            :href="appAuthUrl"
            @click="trackAppOpen"
          >
            <span>{{ plan.cta }}</span>
            <ArrowRightIcon aria-hidden="true" />
          </a>

          <ul class="plan__features">
            <li v-for="f in plan.features" :key="f">
              <CheckIcon aria-hidden="true" />
              <span>{{ f }}</span>
            </li>
          </ul>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
  .pricing {
    padding-block: var(--l-section-y);
  }
  .pricing__inner {
    display: flex;
    flex-direction: column;
    gap: clamp(40px, 5vw, 64px);
  }

  .pricing__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: clamp(16px, 2vw, 24px);
    align-items: stretch;
  }

  .pricing__note {
    margin: calc(-1 * clamp(24px, 3vw, 40px)) 0 0;
    color: var(--l-text-mut);
    font-size: 14px;
    text-align: center;
  }

  .plan {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: clamp(24px, 2.6vw, 34px);
    border-radius: var(--l-r-xl);
    border: 1px solid var(--l-line);
    background: var(--l-bg-elevated);
  }
  .plan--hi {
    border-color: var(--l-line-warm);
    background: radial-gradient(
        130% 80% at 50% 0%,
        oklch(0.77 0.155 58 / 0.12),
        transparent 58%
      ),
      var(--l-bg-elevated);
    box-shadow: var(--l-shadow-warm);
  }

  /* Шапка карточки: бейдж отдельной строкой над названием — так название
     получает всю ширину и укладывается в одну строку. Для карточек без
     бейджа строка резервируется (--empty), чтобы высоты совпадали. */
  .plan__head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .plan__badge {
    flex: none;
    max-width: 100%;
    white-space: nowrap;
    font-size: var(--l-fs-label);
    letter-spacing: 0.02em;
    padding: 5px 11px;
    border-radius: var(--l-r-pill);
    color: var(--l-warm-ink);
    background: var(--l-warm);
  }
  .plan:not(.plan--hi) .plan__badge {
    color: var(--l-text-soft);
    background: oklch(1 0 0 / 0.06);
  }
  .plan__badge--empty {
    visibility: hidden;
  }

  .plan__name {
    font-size: var(--l-fs-h3);
    font-weight: 600;
    line-height: 1.2;
  }
  .plan__desc {
    margin-top: 8px;
    min-height: 2lh;
    color: var(--l-text-mut);
    font-size: var(--l-fs-sm);
  }

  /* Цена над периодом: период не отжимает ширину, цена не переносится */
  .plan__price {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    margin-block: 20px;
  }
  .plan__price-value {
    font-size: clamp(1.85rem, 2.4vw, 2.25rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.05;
    white-space: nowrap;
  }
  .plan__price-period {
    color: var(--l-text-mut);
    font-size: var(--l-fs-sm);
  }

  .plan__cta {
    width: 100%;
  }

  .plan__features {
    /* Растягивает нижнюю часть карточки: карточки одной высоты, CTA на одном уровне */
    flex: 1;
    list-style: none;
    margin: 24px 0 0;
    padding: 22px 0 0;
    border-top: 1px solid var(--l-line);
    display: flex;
    flex-direction: column;
    gap: 13px;
  }
  .plan__features li {
    display: flex;
    gap: 11px;
    align-items: flex-start;
    font-size: var(--l-fs-sm);
    color: var(--l-text-soft);
  }
  .plan__features svg {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    color: var(--l-warm);
  }

  @media (max-width: 899px) {
    .pricing__grid {
      grid-template-columns: 1fr;
      max-width: 460px;
      margin-inline: auto;
      width: 100%;
    }
    .plan__name,
    .plan__desc {
      min-height: 0;
    }
  }
</style>
