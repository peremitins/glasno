<script setup lang="ts">
  import { ArrowRightIcon, CheckIcon } from '@radix-icons/vue';
  import { useLandingContent } from '@/composables/useLandingContent';
  import { useLandingAppAuthUrl } from '@/composables/useLandingAppAuthUrl';

  const { pricing } = useLandingContent();
  const appAuthUrl = useLandingAppAuthUrl();
</script>

<template>
  <section id="pricing" class="pricing">
    <div class="pricing__inner l-container">
      <SectionHeading
        :eyebrow="pricing.eyebrow"
        :title="pricing.title"
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
            <h3 class="plan__name">{{ plan.name }}</h3>
            <span v-if="plan.badge" class="plan__badge">{{ plan.badge }}</span>
          </div>
          <p class="plan__desc">{{ plan.description }}</p>

          <div class="plan__price">
            <strong class="l-tnum">{{ plan.price }}</strong>
            <span>{{ plan.period }}</span>
          </div>

          <a
            class="l-btn plan__cta"
            :class="plan.highlighted ? 'l-btn--primary' : 'l-btn--ghost'"
            :href="appAuthUrl"
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

      <div class="packs" data-reveal>
        <div class="packs__head">
          <strong>{{ pricing.packsLabel }}</strong>
          <span>{{ pricing.packsNote }}</span>
        </div>
        <div class="packs__list">
          <div v-for="pack in pricing.packs" :key="pack.label" class="pack">
            <span class="pack__label">{{ pack.label }}</span>
            <span class="pack__price l-tnum">{{ pack.price }}</span>
            <span v-if="pack.badge" class="pack__badge">{{ pack.badge }}</span>
          </div>
        </div>
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

  /* Шапка карточки: название + бейдж в одном ряду, бейдж в потоке */
  .plan__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .plan__badge {
    position: static;
    flex: none;
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

  .plan__name {
    font-size: var(--l-fs-h3);
    font-weight: 600;
    /* Резерв под 2 строки: длинное название с бейджем переносится,
       без резерва CTA в соседних карточках уезжают по вертикали */
    min-height: 2lh;
  }
  .plan__desc {
    margin-top: 8px;
    min-height: 2lh;
    color: var(--l-text-mut);
    font-size: var(--l-fs-sm);
  }

  .plan__price {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-block: 22px 20px;
  }
  .plan__price strong {
    font-size: clamp(2rem, 3vw, 2.6rem);
    font-weight: 700;
    letter-spacing: -0.03em;
  }
  .plan__price span {
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

  /* Пакеты минут */
  .packs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: clamp(20px, 2.4vw, 28px);
    border-radius: var(--l-r-lg);
    border: 1px dashed var(--l-line-hi);
  }
  .packs__head {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .packs__head strong {
    font-weight: 600;
  }
  .packs__head span {
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
  }
  .packs__list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .pack {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 9px 15px;
    border-radius: var(--l-r-pill);
    border: 1px solid var(--l-line);
    background: var(--l-bg-elevated);
  }
  .pack__label {
    font-size: var(--l-fs-sm);
    color: var(--l-text-soft);
  }
  .pack__price {
    font-weight: 600;
    font-size: var(--l-fs-sm);
  }
  .pack__badge {
    font-size: var(--l-fs-label);
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
    .packs {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
