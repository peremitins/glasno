<script setup lang="ts">
  import { onMounted, ref } from 'vue';

  type CookieConsent = 'accepted';

  const consent = useCookie<CookieConsent | null>(
    'glasno_cookie_consent',
    {
      default: () => null,
      maxAge: 180 * 24 * 60 * 60,
      sameSite: 'lax',
    }
  );
  const isOpen = ref(false);

  function acceptCookies() {
    consent.value = 'accepted';
    isOpen.value = false;
  }

  onMounted(() => {
    isOpen.value = consent.value === null;
  });
</script>

<template>
  <aside v-if="isOpen" class="cookie-banner" aria-label="Уведомление о cookie">
    <p>
      Мы используем cookie для работы сайта и улучшения сервиса. Подробнее в
      <a href="/legal/privacy-policy-ru.html" target="_blank" rel="noopener">
        политике конфиденциальности
      </a>.
    </p>
    <div class="cookie-banner__actions">
      <button class="cookie-banner__primary" type="button" @click="acceptCookies">
        Принять
      </button>
    </div>
  </aside>
</template>

<style scoped>
  .cookie-banner {
    position: fixed;
    z-index: 30;
    right: clamp(16px, 3vw, 36px);
    bottom: clamp(16px, 3vw, 36px);
    left: clamp(16px, 3vw, 36px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    max-width: 900px;
    margin-inline: auto;
    padding: 16px 18px;
    color: var(--l-text-soft);
    background: color-mix(in oklab, var(--l-bg-elevated) 94%, transparent);
    border: 1px solid var(--l-line-hi);
    border-radius: var(--l-r);
    box-shadow: var(--l-shadow);
    backdrop-filter: blur(16px);
  }

  .cookie-banner p {
    max-width: 60ch;
    font-size: var(--l-fs-sm);
    line-height: 1.5;
  }

  .cookie-banner a {
    color: var(--l-warm);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .cookie-banner__actions {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: 8px;
  }

  .cookie-banner button {
    min-height: 38px;
    padding: 8px 12px;
    border-radius: var(--l-r-sm);
    font-size: var(--l-fs-label);
    font-weight: 700;
    transition:
      color var(--l-dur-1) var(--l-ease),
      background var(--l-dur-1) var(--l-ease),
      border-color var(--l-dur-1) var(--l-ease);
  }

  .cookie-banner__primary {
    color: var(--l-warm-ink);
    background: var(--l-warm);
    border: 1px solid var(--l-warm);
  }

  .cookie-banner__primary:hover {
    background: var(--l-warm-solid);
    border-color: var(--l-warm-solid);
  }

  @media (max-width: 720px) {
    .cookie-banner {
      display: grid;
      gap: 14px;
    }

    .cookie-banner__actions {
      width: 100%;
    }

    .cookie-banner button {
      flex: 1;
    }
  }
</style>
