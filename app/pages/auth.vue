<script setup lang="ts">
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EnvelopeClosedIcon,
  LightningBoltIcon,
  MoonIcon,
  SunIcon,
} from '@radix-icons/vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AuroraField from '@/app/components/design/AuroraField.vue';
import { useAuthStore } from '@/app/stores/auth';
import {
  normalizeEmailCode,
  resolveAuthMode,
  resolveSafeNextPath,
  type AuthMode,
} from '@/app/utils/authFlow';

definePageMeta({ layout: false });

const { t } = useI18n();
const auth = useAuthStore();
const route = useRoute();
const { theme, toggleTheme } = useDesignPreferences();

const mode = ref<AuthMode>(resolveAuthMode(route.query.mode));
const step = ref<'form' | 'code'>('form');
const email = ref('');
const code = ref('');
const devCode = ref('');
const localError = ref('');
const codeEmail = ref('');
const resendRemaining = ref(0);
const codeExpiresIn = ref(0);
let resendTimer: ReturnType<typeof setInterval> | null = null;
let expiryTimer: ReturnType<typeof setInterval> | null = null;

const authTitle = computed(() =>
  step.value === 'code'
    ? t('auth.verifyTitle')
    : mode.value === 'signup'
      ? t('auth.signupTitle')
      : t('auth.signinTitle')
);

const authSubtitle = computed(() =>
  step.value === 'code'
    ? t('auth.verifySubtitle', { email: codeEmail.value })
    : mode.value === 'signup'
      ? t('auth.signupSubtitle')
      : t('auth.signinSubtitle')
);

function nextPath(): string {
  return resolveSafeNextPath(route.query.next);
}

function setMode(nextMode: AuthMode) {
  mode.value = nextMode;
  localError.value = '';
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
  try {
    const res =
      mode.value === 'signup'
        ? await auth.startEmailRegistration(normalizedEmail)
        : await auth.startEmailLogin(normalizedEmail);
    devCode.value = res.devCode ?? '';
    codeEmail.value = normalizedEmail;
    code.value = '';
    step.value = 'code';
    startCountdowns();
  } catch {
    localError.value = auth.errorMessage || t('auth.errors.generic');
  }
}

async function resendCode() {
  if (resendRemaining.value > 0 || !codeEmail.value) return;
  localError.value = '';
  try {
    const res = await auth.startEmailLogin(codeEmail.value);
    devCode.value = res.devCode ?? '';
    code.value = '';
    startCountdowns();
  } catch {
    localError.value = auth.errorMessage || t('auth.errors.generic');
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
  try {
    await auth.verifyEmailLogin(codeEmail.value, clean);
    stopCountdowns();
    await navigateTo(nextPath());
  } catch {
    localError.value = auth.errorMessage || t('auth.errors.generic');
  }
}

function resetToForm(nextMode = mode.value) {
  step.value = 'form';
  mode.value = nextMode;
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
                <LightningBoltIcon aria-hidden="true" />
              </span>
              <span>{{ t('app.name') }}</span>
            </NuxtLink>
            <h2>{{ authTitle }}</h2>
            <p>{{ authSubtitle }}</p>
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

        <div v-if="step === 'form'" class="auth-tabs" role="tablist">
          <button
            type="button"
            class="auth-tab"
            :class="{ 'auth-tab--active': mode === 'signin' }"
            @click="setMode('signin')"
          >
            {{ t('auth.tabs.signin') }}
          </button>
          <button
            type="button"
            class="auth-tab"
            :class="{ 'auth-tab--active': mode === 'signup' }"
            @click="setMode('signup')"
          >
            {{ t('auth.tabs.signup') }}
          </button>
        </div>

        <form v-if="step === 'form'" class="auth-form" @submit.prevent="submitEmail">
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

          <button class="primary-action auth-submit" type="submit" :disabled="auth.isSubmitting">
            {{ auth.isSubmitting ? t('auth.sending') : mode === 'signup' ? t('auth.createAccount') : t('auth.getCode') }}
            <span class="primary-action__icon" aria-hidden="true">
              <ArrowRightIcon />
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
            <label for="code">{{ t('auth.codeLabel', { email: codeEmail }) }}</label>
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
            <span>{{ t('auth.codeExpires', { time: formatSeconds(codeExpiresIn) }) }}</span>
            <button
              type="button"
              :disabled="resendRemaining > 0 || auth.isSubmitting"
              @click="resendCode"
            >
              {{
                resendRemaining > 0
                  ? t('auth.resendLater', { seconds: resendRemaining })
                  : t('auth.resend')
              }}
            </button>
          </div>

          <p v-if="devCode" class="hint">{{ t('auth.devCode', { code: devCode }) }}</p>
          <p v-if="localError" class="error">{{ localError }}</p>

          <button class="primary-action auth-submit" type="submit" :disabled="auth.isSubmitting">
            {{ auth.isSubmitting ? t('auth.checking') : t('auth.confirm') }}
            <span class="primary-action__icon" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </button>

          <div class="verify-actions">
            <button type="button" @click="resetToForm()">
              <ArrowLeftIcon aria-hidden="true" />
              {{ t('auth.changeEmail') }}
            </button>
            <button
              type="button"
              @click="resetToForm(mode === 'signin' ? 'signup' : 'signin')"
            >
              {{
                mode === 'signin'
                  ? t('auth.switchToSignup')
                  : t('auth.switchToSignin')
              }}
            </button>
          </div>
        </form>

        <p class="legal">{{ t('auth.legal') }}</p>
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
  color: var(--button-text);
  background: var(--button-bg);
  box-shadow: var(--button-shadow);
}

.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 12px;
}

.brand-mark svg {
  width: 18px;
  height: 18px;
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
  font-size: clamp(28px, 3vw, 42px);
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

.auth-tabs,
.font-row {
  display: grid;
  gap: 7px;
  padding: 6px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}

.auth-tabs {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 18px;
}

.auth-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 800;
  font-size: 14px;
  transition:
    background var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out);
}

.auth-tab:hover {
  color: var(--text-primary);
}

.auth-tab--active {
  background: var(--button-bg);
  color: var(--button-text);
  box-shadow: var(--button-shadow);
}

.auth-form,
.field {
  display: grid;
  gap: 10px;
}

.field label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 900;
}

.input-shell {
  position: relative;
}

.input-shell svg {
  position: absolute;
  top: 50%;
  left: 15px;
  width: 17px;
  height: 17px;
  color: var(--text-muted);
  transform: translateY(-50%);
}

.input-shell input,
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

.input-shell input {
  padding-left: 44px;
}

.code-input {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-align: center;
}

.input-shell input:focus,
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
  gap: 12px;
  align-items: center;
  padding: 14px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
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
  gap: 12px;
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

  .auth-card__head,
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
