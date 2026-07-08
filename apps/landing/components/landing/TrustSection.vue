<script setup lang="ts">
  import { useLandingContent } from '@/composables/useLandingContent';

  const { trust } = useLandingContent();
  const privacyUrl = '/legal/privacy-policy-ru.html';
  const termsUrl = '/legal/terms-of-service-ru.html';
</script>

<template>
  <section id="trust" class="trust">
    <div class="trust__inner l-container">
      <div class="trust__head">
        <SectionHeading :eyebrow="trust.eyebrow" :title="trust.title" />
      </div>

      <ul class="trust__list">
        <li
          v-for="(point, i) in trust.points"
          :key="point.title"
          class="trust__item"
          data-reveal
        >
          <span class="trust__marker l-tnum" aria-hidden="true">
            {{ String(i + 1).padStart(2, '0') }}
          </span>
          <div>
            <h3>{{ point.title }}</h3>
            <p>
              {{ point.text }}
              <template v-if="i === 1">
                <a :href="privacyUrl" target="_blank" rel="noopener">Политика</a>
                <span> и </span>
                <a :href="termsUrl" target="_blank" rel="noopener">условия</a>.
              </template>
            </p>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
  .trust {
    padding-block: var(--l-section-y);
  }

  .trust__inner {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    gap: clamp(32px, 6vw, 96px);
    align-items: start;
  }

  .trust__head {
    position: sticky;
    top: 100px;
  }

  .trust__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .trust__item {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: clamp(16px, 2vw, 28px);
    padding-block: clamp(22px, 3vw, 32px);
    border-top: 1px solid var(--l-line);
  }
  .trust__item:last-child {
    border-bottom: 1px solid var(--l-line);
  }

  .trust__marker {
    font-size: var(--l-fs-sm);
    color: var(--l-warm);
    padding-top: 4px;
  }

  .trust__item h3 {
    font-size: var(--l-fs-h3);
    font-weight: 600;
  }
  .trust__item p {
    margin-top: 10px;
    color: var(--l-text-soft);
    max-width: 52ch;
  }
  .trust__item a {
    color: var(--l-warm);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (max-width: 899px) {
    .trust__inner {
      grid-template-columns: 1fr;
      gap: 32px;
    }
    .trust__head {
      position: static;
    }
  }
</style>
