<script setup lang="ts">
  import { useLandingContent } from '@/composables/useLandingContent';

  const { footer } = useLandingContent();
  const privacyUrl = '/legal/privacy-policy-ru.html';
  const termsUrl = '/legal/terms-of-service-ru.html';
</script>

<template>
  <footer class="ftr">
    <div class="ftr__inner l-container">
      <div class="ftr__brand">
        <span class="ftr__mark">
          <span class="ftr__mark-icon" aria-hidden="true">
            <img
              class="ftr__mark-logo"
              src="/brand/logo.webp"
              alt=""
              width="32"
              height="32"
            >
          </span>
          Гласно
        </span>
        <span class="ftr__tagline">{{ footer.tagline }}</span>
      </div>

      <nav class="ftr__links" aria-label="Ссылки">
        <a :href="`mailto:${footer.email}`">{{ footer.email }}</a>
        <a :href="privacyUrl" target="_blank" rel="noopener">{{
          footer.privacyLabel
        }}</a>
        <a :href="termsUrl" target="_blank" rel="noopener">{{
          footer.termsLabel
        }}</a>
      </nav>

      <span class="ftr__copy">{{ footer.copyright }}</span>
    </div>
  </footer>
</template>

<style scoped>
  .ftr {
    border-top: 1px solid var(--l-line);
    padding-block: clamp(40px, 6vh, 68px);
    background: var(--l-bg-deep);
  }

  .ftr__inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }

  .ftr__brand {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ftr__mark {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 0;
  }
  .ftr__mark-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
  }
  .ftr__mark-logo {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .ftr__tagline {
    font-size: var(--l-fs-sm);
    color: var(--l-text-dim);
  }

  .ftr__links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 22px;
  }
  .ftr__links a {
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
    transition: color var(--l-dur-1) var(--l-ease);
  }
  .ftr__links a:hover {
    color: var(--l-warm);
  }

  .ftr__copy {
    font-size: var(--l-fs-sm);
    color: var(--l-text-dim);
  }

  @media (max-width: 720px) {
    .ftr__inner {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
