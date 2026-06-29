<script setup lang="ts">
import { FontFamilyIcon } from '@radix-icons/vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/app/stores/auth';
import type { BillingStatusResponse } from '@/shared/dto';

const { t } = useI18n();
const auth = useAuthStore();
const api = useAPI();
const { font, fontOptions, setFont } = useDesignPreferences();

const step = ref<'email' | 'code'>('email');
const devCode = ref('');
const form = reactive({
  email: '',
  code: '',
});

const title = computed(() =>
  auth.isAuthenticated ? t('profile.account.title') : t('profile.login.title')
);
const identity = computed(() => {
  const user = auth.user;
  return user?.displayName || user?.email || user?.telegramUsername || user?.id || '';
});
const { data: billingStatus, refresh: refreshBilling } = await useAsyncData(
  'profile-billing-status',
  () => api<BillingStatusResponse>('/api/billing/status')
);

onMounted(() => {
  auth.fetchMe().catch(() => {});
});

async function requestCode() {
  const result = await auth.startEmailLogin(form.email);
  devCode.value = result.devCode || '';
  if (result.devCode) {
    form.code = result.devCode;
  }
  step.value = 'code';
}

async function verifyCode() {
  await auth.verifyEmailLogin(form.email, form.code);
  await refreshBilling();
  devCode.value = '';
}

async function logout() {
  await auth.logout();
  form.code = '';
  step.value = 'email';
  // После выхода уводим на экран авторизации.
  await navigateTo('/auth');
}
</script>

<template>
  <div class="page">
    <header class="header">
      <p class="eyebrow">{{ t('profile.eyebrow') }}</p>
      <h1>{{ title }}</h1>
      <p>{{ t('profile.subtitle') }}</p>
    </header>

    <section v-if="auth.isAuthenticated" class="panel">
      <div class="account">
        <div>
          <p class="label">{{ t('profile.account.signedInAs') }}</p>
          <h2>{{ identity }}</h2>
          <p class="muted">{{ auth.user?.email || auth.user?.telegramUsername }}</p>
        </div>
        <span class="role">{{ auth.user?.role }}</span>
      </div>

      <dl class="details">
        <div>
          <dt>{{ t('profile.account.userId') }}</dt>
          <dd>{{ auth.user?.id }}</dd>
        </div>
        <div>
          <dt>{{ t('profile.account.email') }}</dt>
          <dd>{{ auth.user?.email || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('profile.account.telegram') }}</dt>
          <dd>{{ auth.user?.telegramUsername || auth.user?.telegramId || '—' }}</dd>
        </div>
      </dl>

      <div class="billing">
        <div>
          <p class="label">{{ t('profile.account.billing') }}</p>
          <h3>
            {{
              billingStatus?.hasActiveSubscription
                ? t('billing.active')
                : t('billing.inactive')
            }}
          </h3>
          <p class="muted">
            {{
              t('pricing.freeUsed', {
                used: billingStatus?.freeSessionsUsed ?? 0,
                limit: billingStatus?.freeSessionsLimit ?? 1,
              })
            }}
          </p>
        </div>
        <NuxtLink to="/pricing" class="upgrade">{{ t('billing.upgrade') }}</NuxtLink>
      </div>

      <div class="preferences">
        <div class="preferences-head">
          <span class="preferences-icon" aria-hidden="true">
            <FontFamilyIcon />
          </span>
          <div>
            <p class="label">{{ t('profile.preferences.kicker') }}</p>
            <h3>{{ t('profile.preferences.fontTitle') }}</h3>
            <p class="muted">{{ t('profile.preferences.fontHint') }}</p>
          </div>
        </div>

        <div class="font-options" role="group" :aria-label="t('layout.fontPicker')">
          <button
            v-for="option in fontOptions"
            :key="option.value"
            type="button"
            class="font-option"
            :class="{ 'font-option--active': font === option.value }"
            :title="option.title"
            @click="setFont(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <button class="secondary" type="button" :disabled="auth.isSubmitting" @click="logout">
        {{ t('profile.actions.logout') }}
      </button>
    </section>

    <form v-else class="panel" @submit.prevent="step === 'email' ? requestCode() : verifyCode()">
      <div class="field">
        <label for="email">{{ t('profile.fields.email') }}</label>
        <input
          id="email"
          v-model="form.email"
          type="email"
          autocomplete="email"
          :disabled="step === 'code' || auth.isSubmitting"
          required
        />
      </div>

      <div v-if="step === 'code'" class="field">
        <label for="code">{{ t('profile.fields.code') }}</label>
        <input
          id="code"
          v-model="form.code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          :disabled="auth.isSubmitting"
          required
        />
      </div>

      <p v-if="devCode" class="notice">
        {{ t('profile.login.devCode', { code: devCode }) }}
      </p>
      <p v-if="auth.errorMessage" class="error">{{ auth.errorMessage }}</p>

      <div class="actions">
        <button class="primary" type="submit" :disabled="auth.isSubmitting">
          {{
            step === 'email'
              ? t('profile.actions.sendCode')
              : t('profile.actions.verifyCode')
          }}
        </button>
        <button
          v-if="step === 'code'"
          class="ghost"
          type="button"
          :disabled="auth.isSubmitting"
          @click="step = 'email'; form.code = ''; devCode = ''"
        >
          {{ t('profile.actions.changeEmail') }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.header {
  max-width: 720px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--color-accent);
  font-weight: 700;
  font-size: 13px;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin: 0;
}

.header h1 {
  font-size: clamp(30px, 4vw, 44px);
  line-height: 1.06;
  margin-bottom: 10px;
}

.header p:last-child,
.muted {
  color: var(--color-muted);
}

.panel {
  width: min(680px, 100%);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 22px;
}

.account {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.label {
  color: var(--color-muted);
  font-size: 13px;
  margin-bottom: 4px;
}

.role {
  border: 1px solid color-mix(in srgb, var(--color-accent) 25%, white);
  color: var(--color-accent);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 700;
}

.details {
  display: grid;
  gap: 12px;
  margin: 0 0 20px;
}

.details div {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  gap: 12px;
}

dt {
  color: var(--color-muted);
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.billing {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: 14px;
  margin-bottom: 18px;
}

.preferences {
  display: grid;
  gap: 14px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  padding: 14px;
  margin-bottom: 18px;
}

.preferences-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.preferences-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 13px;
  background: var(--surface-raised);
  color: var(--text-primary);
}

.preferences-icon svg {
  width: 18px;
  height: 18px;
}

.font-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 5px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: var(--surface-soft);
}

.font-option {
  min-width: 0;
  min-height: 38px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 900;
}

.font-option--active {
  background: var(--button-bg);
  color: var(--button-text);
  box-shadow: var(--button-shadow);
}

.billing h3 {
  font-size: 18px;
  margin-bottom: 4px;
}

.upgrade {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  border-radius: 8px;
  background: var(--color-accent);
  color: #fff;
  padding: 0 12px;
  text-decoration: none;
  font-weight: 800;
  white-space: nowrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

label {
  font-weight: 700;
}

input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 12px 14px;
  font: inherit;
  background: white;
}

input:disabled {
  color: var(--color-muted);
  background: var(--color-bg);
}

.notice {
  border: 1px solid color-mix(in srgb, var(--color-accent) 20%, white);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 8%, white);
  margin-bottom: 14px;
}

.error {
  color: var(--color-danger);
  margin-bottom: 14px;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.primary,
.secondary,
.ghost {
  border: 0;
  border-radius: 10px;
  padding: 11px 16px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.primary {
  color: white;
  background: var(--color-accent);
}

.secondary {
  color: var(--button-text);
  background: var(--button-bg);
}

.ghost {
  color: var(--color-text);
  background: var(--color-bg);
}

button:disabled {
  cursor: default;
  opacity: 0.65;
}

@media (max-width: 640px) {
  .panel {
    padding: 18px;
  }

  .account,
  .details div {
    grid-template-columns: 1fr;
  }

  .account,
  .billing {
    flex-direction: column;
    align-items: stretch;
  }

  .upgrade {
    width: 100%;
  }
}
</style>
