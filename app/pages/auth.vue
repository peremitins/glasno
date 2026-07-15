<script setup lang="ts">
  import {
    ArrowLeftIcon,
    ArrowRightIcon,
    EnvelopeClosedIcon,
    MoonIcon,
    SunIcon,
  } from '@radix-icons/vue';
  import { computed, onBeforeUnmount, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import AuroraField from '@/app/components/design/AuroraField.vue';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import { useAuthStore } from '@/app/stores/auth';
  import {
    normalizeEmailCode,
    resolveSafeNextPath,
  } from '@/app/utils/authFlow';

  definePageMeta({ layout: false });

  const { t } = useI18n();
  const auth = useAuthStore();
  const route = useRoute();
  const { theme, toggleTheme } = useDesignPreferences();
  const termsOfServiceUrl = 'https://glasno.app/legal/terms-of-service-ru.html';
  const privacyPolicyUrl = 'https://glasno.app/legal/privacy-policy-ru.html';

  const step = ref<'form' | 'code'>('form');
  const email = ref('');
  const code = ref('');
  const devCode = ref('');
  const localError = ref('');
  const codeEmail = ref('');
  const resendRemaining = ref(0);
  const codeExpiresIn = ref(0);
  const authAction = ref<'email' | 'resend' | 'code' | null>(null);
  let resendTimer: ReturnType<typeof setInterval> | null = null;
  let expiryTimer: ReturnType<typeof setInterval> | null = null;

  const authTitle = computed(() =>
    step.value === 'code' ? t('auth.verifyTitle') : t('auth.signinTitle')
  );

  function nextPath(): string {
    return resolveSafeNextPath(route.query.next);
  }

  function startCountdowns() {
    stopCountdowns();
    resendRemaining.value = 60;
    codeExpiresIn.value = 10 * 60;

    resendTimer = setInterval(() => {
      resendRemaining.value = Math.max(0, resendRemaining.value - 1);
      if (resendRemaining.value === 0 && resendTimer) {
        clearInterval(resendTimer);
        resendTimer = null;
      }
    }, 1000);

    expiryTimer = setInterval(() => {
      codeExpiresIn.value = Math.max(0, codeExpiresIn.value - 1);
      if (codeExpiresIn.value === 0 && expiryTimer) {
        clearInterval(expiryTimer);
        expiryTimer = null;
      }
    }, 1000);
  }

  function stopCountdowns() {
    if (resendTimer) clearInterval(resendTimer);
    if (expiryTimer) clearInterval(expiryTimer);
    resendTimer = null;
    expiryTimer = null;
  }

  function formatSeconds(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${rest.toString().padStart(2, '0')}`;
  }

  async function submitEmail() {
    localError.value = '';
    const normalizedEmail = email.value.trim();
    if (!normalizedEmail) return;
    authAction.value = 'email';
    try {
      const res = await auth.startEmailLogin(normalizedEmail);
      devCode.value = res.devCode ?? '';
      codeEmail.value = normalizedEmail;
      code.value = '';
      step.value = 'code';
      startCountdowns();
    } catch {
      localError.value = auth.errorMessage || t('auth.errors.generic');
    } finally {
      authAction.value = null;
    }
  }

  async function resendCode() {
    if (resendRemaining.value > 0 || !codeEmail.value) return;
    localError.value = '';
    authAction.value = 'resend';
    try {
      const res = await auth.startEmailLogin(codeEmail.value);
      devCode.value = res.devCode ?? '';
      code.value = '';
      startCountdowns();
    } catch {
      localError.value = auth.errorMessage || t('auth.errors.generic');
    } finally {
      authAction.value = null;
    }
  }

  async function submitCode() {
    localError.value = '';
    const clean = normalizeEmailCode(code.value);
    code.value = clean;
    if (!/^\d{6}$/.test(clean)) {
      localError.value = t('auth.errors.code');
      return;
    }
    authAction.value = 'code';
    try {
      await auth.verifyEmailLogin(codeEmail.value, clean);
      stopCountdowns();
      await navigateTo(nextPath());
    } catch {
      localError.value = auth.errorMessage || t('auth.errors.generic');
    } finally {
      authAction.value = null;
    }
  }

  function resetToForm() {
    step.value = 'form';
    code.value = '';
    devCode.value = '';
    localError.value = '';
    stopCountdowns();
  }

  function onCodeInput() {
    code.value = normalizeEmailCode(code.value);
  }

  onBeforeUnmount(() => {
    stopCountdowns();
  });
</script>

<template>
  <main class="auth-page">
    <AuroraField />

    <section class="auth-shell">
      <article class="auth-card glass-frame">
        <header class="auth-card__head">
          <div>
            <NuxtLink to="/" class="brand">
              <span class="brand-mark">
                <img
                  class="brand-logo"
                  src="/brand/logo.webp"
                  alt=""
                  width="40"
                  height="40"
                  aria-hidden="true"
                />
              </span>
              <span>{{ t('app.name') }}</span>
            </NuxtLink>
            <h2>{{ authTitle }}</h2>
          </div>

          <div class="auth-toolbar">
            <button
              type="button"
              class="icon-button"
              :aria-label="t('layout.themeToggle')"
              @click="toggleTheme"
            >
              <SunIcon v-if="theme === 'dark'" aria-hidden="true" />
              <MoonIcon v-else aria-hidden="true" />
            </button>
          </div>
        </header>

        <form
          v-if="step === 'form'"
          class="auth-form"
          @submit.prevent="submitEmail"
        >
          <div class="field">
            <label for="email">{{ t('auth.emailLabel') }}</label>
            <div class="input-shell">
              <EnvelopeClosedIcon aria-hidden="true" />
              <input
                id="email"
                v-model="email"
                type="email"
                inputmode="email"
                autocomplete="email"
                autocapitalize="none"
                spellcheck="false"
                :placeholder="t('auth.emailPlaceholder')"
                required
              />
            </div>
          </div>

          <p v-if="localError" class="error">{{ localError }}</p>

          <button
            class="primary-action auth-submit button-loader-host"
            type="submit"
            :disabled="auth.isSubmitting"
          >
            <ButtonLoader v-if="authAction === 'email'" />
            <span
              class="button-loader-content"
              :class="{
                'button-loader-content--loading': authAction === 'email',
              }"
            >
              {{ t('auth.getCode') }}
              <span class="primary-action__icon" aria-hidden="true">
                <ArrowRightIcon />
              </span>
            </span>
          </button>
        </form>

        <form v-else class="auth-form" @submit.prevent="submitCode">
          <div class="verify-note">
            <span class="verify-note__icon" aria-hidden="true">
              <EnvelopeClosedIcon />
            </span>
            <p>{{ t('auth.codeSent', { email: codeEmail }) }}</p>
          </div>

          <div class="field">
            <label for="code">{{
              t('auth.codeLabel', { email: codeEmail })
            }}</label>
            <input
              id="code"
              v-model="code"
              class="code-input"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              placeholder="000000"
              required
              @input="onCodeInput"
            />
          </div>

          <div class="code-meta">
            <span>{{
              t('auth.codeExpires', { time: formatSeconds(codeExpiresIn) })
            }}</span>
            <button
              type="button"
              class="button-loader-host auth-inline-action"
              :disabled="resendRemaining > 0 || auth.isSubmitting"
              @click="resendCode"
            >
              <ButtonLoader v-if="authAction === 'resend'" />
              <span
                class="button-loader-content"
                :class="{
                  'button-loader-content--loading': authAction === 'resend',
                }"
              >
                {{
                  resendRemaining > 0
                    ? t('auth.resendLater', { seconds: resendRemaining })
                    : t('auth.resend')
                }}
              </span>
            </button>
          </div>

          <p v-if="devCode" class="hint">
            {{ t('auth.devCode', { code: devCode }) }}
          </p>
          <p v-if="localError" class="error">{{ localError }}</p>

          <button
            class="primary-action auth-submit button-loader-host"
            type="submit"
            :disabled="auth.isSubmitting"
          >
            <ButtonLoader v-if="authAction === 'code'" />
            <span
              class="button-loader-content"
              :class="{
                'button-loader-content--loading': authAction === 'code',
              }"
            >
              {{ t('auth.confirm') }}
              <span class="primary-action__icon" aria-hidden="true">
                <ArrowRightIcon />
              </span>
            </span>
          </button>

          <div class="verify-actions">
            <button type="button" @click="resetToForm()">
              <ArrowLeftIcon aria-hidden="true" />
              {{ t('auth.changeEmail') }}
            </button>
          </div>
        </form>

        <p class="legal">
          {{ t('auth.legalPrefix') }}
          <a
            :href="termsOfServiceUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ t('auth.termsLink') }}
          </a>
          {{ t('auth.legalBetween') }}
          <a :href="privacyPolicyUrl" target="_blank" rel="noopener noreferrer">
            {{ t('auth.privacyLink') }} </a
          >{{ t('auth.legalSuffix') }}
        </p>
      </article>
    </section>
  </main>
</template>

<style scoped>
  .auth-page {
    position: relative;
    min-height: 100dvh;
    padding: clamp(14px, 3vw, 34px);
  }

  .auth-shell {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    width: min(460px, 100%);
    min-height: calc(100dvh - clamp(28px, 6vw, 68px));
    margin: 0 auto;
  }

  .auth-card {
    width: 100%;
    padding: clamp(22px, 4vw, 40px);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 800;
    text-decoration: none;
  }

  .brand-mark,
  .verify-note__icon {
    display: grid;
    place-items: center;
  }

  .verify-note__icon {
    color: var(--button-text);
    background: var(--button-bg);
    box-shadow: var(--button-shadow);
  }

  .brand-mark {
    width: 40px;
    height: 40px;
    background: transparent;
    box-shadow: none;
    overflow: visible;
  }

  .brand-logo {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .visual-copy {
    max-width: 620px;
  }

  .visual-copy .page-subtitle {
    margin-top: 18px;
  }

  .trust-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .trust-list span {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 54px;
    padding: 12px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  .trust-list svg {
    flex: 0 0 auto;
    color: var(--accent-2);
  }

  .auth-card {
    align-self: center;
  }

  .auth-card__head {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 22px;
  }

  .auth-card__head h2,
  .auth-card__head p {
    margin: 0;
  }

  .auth-card__head h2 {
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: clamp(22px, 2.4vw, 32px);
    line-height: 1;
    letter-spacing: 0;
  }

  .auth-card__head p:last-child {
    margin-top: 10px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .icon-button {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    background: var(--surface-soft);
    color: var(--text-primary);
    cursor: pointer;
    transition: background var(--motion-fast) var(--ease-out);
  }

  .icon-button:hover {
    background: var(--surface-raised);
  }

  .icon-button svg {
    width: 18px;
    height: 18px;
  }

  .auth-toolbar {
    display: flex;
    align-items: flex-start;
  }

  .font-row {
    display: grid;
    gap: 7px;
    padding: 6px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--surface-soft);
  }

  .auth-form,
  .field {
    display: grid;
    gap: 10px;
  }

  .field {
    gap: 5px;
  }

  .field label {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 900;
  }

  .field-optional,
  .field-hint {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 700;
  }

  .field-optional {
    margin-left: 4px;
  }

  .field-hint {
    margin: -2px 0 0;
    line-height: 1.4;
  }

  .code-input {
    width: 100%;
    min-height: 54px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
    color: var(--text-primary);
    outline: 0;
    padding: 0 16px;
  }

  .code-input {
    font-family: var(--font-mono);
    font-size: 24px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-align: center;
  }

  .code-input:focus {
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--focus-ring) 18%, transparent);
  }

  .auth-submit {
    width: 100%;
    margin-top: 8px;
  }

  .verify-note {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    gap: clamp(12px, 1.6vw, 16px);
    align-items: center;
    padding: 14px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--surface-soft);
    word-break: break-word;
  }

  .verify-note p,
  .legal,
  .hint,
  .error {
    margin: 0;
  }

  .verify-note p {
    color: var(--text-secondary);
    line-height: 1.45;
  }

  .verify-note__icon {
    width: 44px;
    height: 44px;
    border-radius: 16px;
  }

  .code-meta,
  .verify-actions {
    display: flex;
    justify-content: space-between;
    gap: clamp(12px, 1.6vw, 16px);
    align-items: center;
  }

  .code-meta {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 800;
  }

  .code-meta button,
  .verify-actions button {
    border: 0;
    background: transparent;
    color: var(--accent-2);
    cursor: pointer;
    font-weight: 900;
  }

  .code-meta button:disabled {
    cursor: not-allowed;
    color: var(--text-muted);
  }

  .verify-actions button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .hint {
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 800;
  }

  .error {
    color: var(--danger);
    font-weight: 900;
  }

  .font-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 20px;
  }

  .legal {
    margin-top: 18px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .legal a {
    color: var(--text-primary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  @media (max-width: 920px) {
    .auth-shell {
      grid-template-columns: 1fr;
    }

    .auth-visual {
      min-height: auto;
      gap: 42px;
    }

    .trust-list {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .auth-page {
      padding: 10px;
    }

    .auth-visual,
    .auth-card {
      padding: 18px;
    }

    .code-meta,
    .verify-actions {
      flex-direction: column;
      align-items: flex-start;
    }

    .font-row {
      grid-template-columns: 1fr;
    }
  }
</style>
