<script setup lang="ts">
  import {
    ExitIcon,
    FileTextIcon,
    FontFamilyIcon,
    PersonIcon,
    TrashIcon,
  } from '@radix-icons/vue';
  import { computed, onMounted, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import { useAuthStore } from '@/app/stores/auth';
  import type { BillingStatusResponse } from '@/shared/dto';

  const { t } = useI18n();
  const auth = useAuthStore();
  const api = useAPI();
  const { font, fontOptions, setFont } = useDesignPreferences();
  const termsOfServiceUrl = 'https://glasno.app/legal/terms-of-service-ru.html';
  const privacyPolicyUrl = 'https://glasno.app/legal/privacy-policy-ru.html';

  const step = ref<'email' | 'code'>('email');
  const devCode = ref('');
  const deleteDialogOpen = ref(false);
  const deleteError = ref('');
  const isDeletingAccount = ref(false);
  const profileAuthAction = ref<'send-code' | 'verify-code' | 'logout' | null>(
    null
  );
  const form = reactive({
    email: '',
    code: '',
  });

  const {
    data: billingStatus,
    pending: billingPending,
    refresh: refreshBilling,
  } = await useLazyAsyncData('profile-billing-status', () =>
    api<BillingStatusResponse>('/api/billing/status')
  );

  const accountEmail = computed(() => auth.user?.email || '—');
  const telegramIdentity = computed(
    () => auth.user?.telegramUsername || auth.user?.telegramId || '—'
  );
  const profileSubmitLoading = computed(
    () =>
      profileAuthAction.value === 'send-code' ||
      profileAuthAction.value === 'verify-code'
  );
  const profileBillingInitialPending = computed(
    () => billingPending.value && !billingStatus.value
  );
  const subscriptionDescription = computed(() => {
    const billing = billingStatus.value;
    if (billing?.activeAccess) {
      return `${billing.activeAccess.planName} · ${t('pricing.activeUntil', {
        date: formatDate(billing.activeAccess.expiresAt),
      })}`;
    }
    if (billing?.lastAccessEndedAt) {
      return t('pricing.accessExpiredAt', {
        plan: billing.lastAccessPlanName ?? '',
        date: formatDate(billing.lastAccessEndedAt),
      });
    }

    return t('pricing.freeUsed', {
      used: billing?.freeSessionsUsed ?? 0,
      limit: billing?.freeSessionsLimit ?? 1,
    });
  });

  onMounted(() => {
    auth.fetchMe().catch(() => {});
  });

  function formatDate(value: string | null | undefined) {
    if (!value) return '';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(value));
  }

  async function requestCode() {
    if (profileAuthAction.value) return;
    profileAuthAction.value = 'send-code';
    try {
      const result = await auth.startEmailLogin(form.email);
      devCode.value = result.devCode || '';
      if (result.devCode) {
        form.code = result.devCode;
      }
      step.value = 'code';
    } catch {
      // Текст ошибки хранит auth-store и уже выводит форма.
    } finally {
      profileAuthAction.value = null;
    }
  }

  async function verifyCode() {
    if (profileAuthAction.value) return;
    profileAuthAction.value = 'verify-code';
    try {
      await auth.verifyEmailLogin(form.email, form.code);
      await refreshBilling();
      devCode.value = '';
    } catch {
      // Текст ошибки хранит auth-store и уже выводит форма.
    } finally {
      profileAuthAction.value = null;
    }
  }

  async function logout() {
    if (profileAuthAction.value) return;
    profileAuthAction.value = 'logout';
    try {
      await auth.logout();
      form.code = '';
      step.value = 'email';
      await navigateTo('/auth');
    } catch {
      // auth-store сбрасывает isSubmitting и сохраняет сообщение об ошибке.
    } finally {
      profileAuthAction.value = null;
    }
  }

  function confirmDeleteAccount() {
    deleteError.value = '';
    deleteDialogOpen.value = true;
  }

  function cancelDeleteAccount() {
    if (isDeletingAccount.value) return;
    deleteDialogOpen.value = false;
    deleteError.value = '';
  }

  async function deleteAccount() {
    if (isDeletingAccount.value) return;
    isDeletingAccount.value = true;
    deleteError.value = '';

    try {
      await auth.deleteAccount();
      deleteDialogOpen.value = false;
      form.email = '';
      form.code = '';
      step.value = 'email';
      await navigateTo('/auth');
    } catch {
      deleteError.value = auth.errorMessage || t('profile.delete.error');
    } finally {
      isDeletingAccount.value = false;
    }
  }
</script>

<template>
  <div class="profile-page app-page">
    <GlassSkeletonStack
      v-if="auth.isAuthenticated && profileBillingInitialPending"
      class="profile-skeleton"
      :heights="[172, 128, 146, 128, 116]"
    />

    <div v-else-if="auth.isAuthenticated" class="profile-shell">
      <section class="profile-card account-card glass-frame glass-frame--soft">
        <div class="profile-card__head">
          <span class="profile-card__icon" aria-hidden="true">
            <PersonIcon />
          </span>
          <span v-if="auth.user?.role === 'admin'" class="role">
            {{ t('profile.account.adminRole') }}
          </span>
        </div>

        <dl class="details">
          <div>
            <dt>{{ t('profile.account.email') }}</dt>
            <dd>{{ accountEmail }}</dd>
          </div>
          <div>
            <dt>{{ t('profile.account.userId') }}</dt>
            <dd>{{ auth.user?.id }}</dd>
          </div>
          <div>
            <dt>{{ t('profile.account.telegram') }}</dt>
            <dd>{{ telegramIdentity }}</dd>
          </div>
        </dl>
      </section>

      <section
        class="profile-card subscription-card glass-frame glass-frame--soft"
      >
        <div class="profile-card__title">
          <p class="panel-label">{{ t('profile.sections.subscription') }}</p>
          <h3>
            {{
              billingStatus?.hasActivePaidAccess
                ? t('billing.active')
                : t('billing.inactive')
            }}
          </h3>
          <p class="muted">{{ subscriptionDescription }}</p>
        </div>
        <NuxtLink
          to="/pricing"
          class="primary-action primary-action--compact subscription-action"
        >
          {{ t('billing.upgrade') }}
        </NuxtLink>
      </section>

      <section
        class="profile-card profile-card--wide glass-frame glass-frame--soft"
      >
        <div class="profile-card__head">
          <span class="profile-card__icon" aria-hidden="true">
            <FontFamilyIcon />
          </span>
          <div class="profile-card__title">
            <p class="panel-label">{{ t('profile.preferences.kicker') }}</p>
            <h3>{{ t('profile.preferences.fontTitle') }}</h3>
            <p class="muted">{{ t('profile.preferences.fontHint') }}</p>
          </div>
        </div>

        <div
          class="font-options"
          role="group"
          :aria-label="t('layout.fontPicker')"
        >
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
      </section>

      <section class="profile-card glass-frame glass-frame--soft">
        <div class="profile-card__title">
          <p class="panel-label">{{ t('profile.sections.documents') }}</p>
          <h3>{{ t('profile.documents.title') }}</h3>
        </div>

        <div class="settings-list">
          <a
            class="settings-row"
            :href="termsOfServiceUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="settings-row__icon" aria-hidden="true">
              <FileTextIcon />
            </span>
            <span class="settings-row__content">
              <span>{{ t('profile.documents.terms') }}</span>
              <small>{{ t('profile.documents.open') }}</small>
            </span>
          </a>
          <a
            class="settings-row"
            :href="privacyPolicyUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="settings-row__icon" aria-hidden="true">
              <FileTextIcon />
            </span>
            <span class="settings-row__content">
              <span>{{ t('profile.documents.privacy') }}</span>
              <small>{{ t('profile.documents.open') }}</small>
            </span>
          </a>
        </div>
      </section>

      <section class="profile-card danger-panel glass-frame glass-frame--soft">
        <div class="profile-card__title">
          <p class="panel-label">{{ t('profile.sections.danger') }}</p>
          <h3>{{ t('profile.danger.title') }}</h3>
          <p class="muted">{{ t('profile.danger.hint') }}</p>
        </div>

        <div class="danger-actions">
          <button
            class="secondary-action secondary-action--compact button-loader-host"
            type="button"
            :disabled="auth.isSubmitting"
            @click="logout"
          >
            <ButtonLoader v-if="profileAuthAction === 'logout'" />
            <span
              class="button-loader-content"
              :class="{
                'button-loader-content--loading':
                  profileAuthAction === 'logout',
              }"
            >
              <ExitIcon aria-hidden="true" />
              {{ t('profile.actions.logout') }}
            </span>
          </button>
          <button
            class="delete-action"
            type="button"
            :disabled="auth.isSubmitting"
            @click="confirmDeleteAccount"
          >
            <TrashIcon aria-hidden="true" />
            {{ t('profile.actions.deleteAccount') }}
          </button>
        </div>
      </section>
    </div>

    <form
      v-else
      class="auth-panel glass-frame glass-frame--soft"
      @submit.prevent="step === 'email' ? requestCode() : verifyCode()"
    >
      <div class="field">
        <label for="email">{{ t('profile.fields.email') }}</label>
        <input
          id="email"
          v-model="form.email"
          class="soft-control"
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
          class="soft-control"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          :disabled="auth.isSubmitting"
          required
        />
      </div>

      <p v-if="devCode" class="notice glass-card">
        {{ t('profile.login.devCode', { code: devCode }) }}
      </p>
      <p v-if="auth.errorMessage" class="error">{{ auth.errorMessage }}</p>

      <div class="actions">
        <button
          class="primary-action primary-action--compact button-loader-host"
          type="submit"
          :disabled="auth.isSubmitting"
        >
          <ButtonLoader v-if="profileSubmitLoading" />
          <span
            class="button-loader-content"
            :class="{ 'button-loader-content--loading': profileSubmitLoading }"
          >
            {{
              step === 'email'
                ? t('profile.actions.sendCode')
                : t('profile.actions.verifyCode')
            }}
          </span>
        </button>
        <button
          v-if="step === 'code'"
          class="secondary-action secondary-action--compact"
          type="button"
          :disabled="auth.isSubmitting"
          @click="
            step = 'email';
            form.code = '';
            devCode = '';
          "
        >
          {{ t('profile.actions.changeEmail') }}
        </button>
      </div>
    </form>

    <Teleport to="body">
      <div
        v-if="deleteDialogOpen"
        class="delete-backdrop"
        role="presentation"
        @click.self="cancelDeleteAccount"
      >
        <section
          class="delete-dialog glass-frame"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-dialog-title"
        >
          <div>
            <p class="panel-label">{{ t('profile.delete.kicker') }}</p>
            <h2 id="delete-account-dialog-title">
              {{ t('profile.delete.title') }}
            </h2>
            <p class="dialog-copy">{{ t('profile.delete.text') }}</p>
          </div>

          <p v-if="deleteError" class="delete-error">{{ deleteError }}</p>

          <div class="dialog-actions">
            <button
              type="button"
              class="secondary-action secondary-action--compact"
              :disabled="isDeletingAccount"
              @click="cancelDeleteAccount"
            >
              {{ t('profile.delete.cancel') }}
            </button>
            <button
              type="button"
              class="delete-action button-loader-host"
              :disabled="isDeletingAccount"
              @click="deleteAccount"
            >
              <ButtonLoader v-if="isDeletingAccount" />
              <span
                class="button-loader-content"
                :class="{
                  'button-loader-content--loading': isDeletingAccount,
                }"
              >
                {{ t('profile.delete.confirm') }}
              </span>
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
  .profile-page {
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 1.6vw, 16px);
    align-items: flex-start;
  }

  .profile-shell {
    display: grid;
    grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
    gap: clamp(12px, 1.6vw, 16px);
    width: 100%;
    max-width: 1040px;
    align-items: stretch;
  }

  .profile-skeleton {
    width: 100%;
    max-width: 1040px;
    gap: clamp(12px, 1.6vw, 16px);
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  .muted {
    color: var(--text-muted);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .profile-card,
  .auth-panel {
    min-width: 0;
    padding: clamp(15px, 2.2vw, 26px);
  }

  .profile-card {
    display: grid;
    gap: 18px;
  }

  .profile-card--wide {
    grid-column: 1 / -1;
  }

  .profile-card__head {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: start;
  }

  .profile-card__title {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .profile-card__icon,
  .settings-row__icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: inset 0 1px 0 var(--inner-highlight);
    color: var(--text-primary);
  }

  .profile-card__icon svg,
  .settings-row__icon svg {
    width: 18px;
    height: 18px;
  }

  .profile-card h2,
  .profile-card h3 {
    color: var(--text-primary);
    line-height: 1.2;
  }

  .profile-card h2 {
    font-size: 20px;
  }

  .profile-card h3 {
    font-size: 18px;
  }

  .role {
    justify-self: end;
    align-self: start;
    border: 1px solid color-mix(in srgb, var(--accent) 38%, transparent);
    color: var(--accent-2);
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    font-family: var(--font-mono);
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 900;
    line-height: 1;
  }

  .details {
    display: grid;
    margin: 0;
    border-top: 1px solid var(--glass-border);
  }

  .details div {
    display: grid;
    grid-template-columns: 128px minmax(0, 1fr);
    gap: 14px;
    align-items: baseline;
    padding: 11px 0;
    border-bottom: 1px solid
      color-mix(in srgb, var(--glass-border) 70%, transparent);
  }

  dt {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 800;
  }

  dd {
    min-width: 0;
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }

  .subscription-card {
    grid-template-rows: auto 1fr;
  }

  .subscription-action {
    align-self: end;
    justify-self: start;
  }

  .font-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
    padding: 5px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
    box-shadow: inset 0 1px 0 var(--inner-highlight);
  }

  .font-option {
    min-width: 0;
    min-height: 42px;
    border: 0;
    border-radius: calc(var(--radius-control) - 5px);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 900;
    transition: background var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }

  .font-option:hover {
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .font-option:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
    outline-offset: 2px;
  }

  .font-option--active {
    background: var(--button-bg);
    color: var(--button-text);
    box-shadow: var(--button-shadow);
  }

  .settings-list {
    display: grid;
    gap: 10px;
  }

  .settings-row {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: clamp(12px, 1.6vw, 16px);
    align-items: center;
    min-height: 62px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    color: var(--text-primary);
    font: inherit;
    padding: 10px 14px 10px 10px;
    text-align: left;
    text-decoration: none;
    transition: border-color var(--motion-fast) var(--ease-out),
      background var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }

  .settings-row[href]:hover {
    border-color: var(--glass-border-strong);
    background: var(--surface-raised);
    transform: translateY(-1px);
  }

  .settings-row:disabled {
    cursor: default;
    opacity: 0.78;
  }

  .settings-row__content {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: clamp(12px, 1.6vw, 16px);
  }

  .settings-row__content > span {
    min-width: 0;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  .settings-row small {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .danger-panel {
    align-items: start;
  }

  .danger-actions,
  .dialog-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .danger-actions {
    justify-content: flex-start;
    margin-top: auto;
  }

  .secondary-action,
  .delete-action {
    gap: 8px;
  }

  .secondary-action svg,
  .delete-action svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
  }

  .delete-action {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    border: 1px solid color-mix(in srgb, var(--danger) 38%, transparent);
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
    cursor: pointer;
    font: inherit;
    font-weight: 900;
    padding: 0 16px;
    text-decoration: none;
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out);
  }

  .delete-action:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--danger) 62%, var(--glass-border));
    background: color-mix(in srgb, var(--danger) 18%, var(--surface-raised));
    color: var(--text-primary);
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
    padding: 12px 14px;
  }

  input:disabled {
    color: var(--text-muted);
    background: var(--surface-soft);
  }

  .notice {
    padding: 10px 12px;
    color: var(--accent-2);
    margin-bottom: 14px;
  }

  .error,
  .delete-error {
    color: var(--danger);
    margin-bottom: 14px;
  }

  .delete-error {
    font-weight: 800;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  button:disabled {
    cursor: default;
    opacity: 0.65;
  }

  button:disabled:hover {
    transform: none;
  }

  .delete-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 20px;
    background: color-mix(in srgb, var(--app-bg) 72%, transparent);
    backdrop-filter: blur(18px);
  }

  .delete-dialog {
    display: grid;
    gap: 18px;
    width: min(460px, 100%);
    padding: clamp(18px, 2vw, 24px);
  }

  .delete-dialog h2 {
    color: var(--text-primary);
    font-size: 24px;
    margin: 6px 0 8px;
  }

  .dialog-copy {
    color: var(--text-secondary);
    line-height: 1.5;
  }

  @media (max-width: 920px) {
    .profile-shell {
      grid-template-columns: 1fr;
      max-width: 760px;
    }

    .profile-card--wide {
      grid-column: auto;
    }
  }

  @media (max-width: 640px) {
    .profile-card,
    .auth-panel {
      padding: clamp(15px, 2.2vw, 26px);
    }

    .profile-card__head {
      grid-template-columns: 38px minmax(0, 1fr);
    }

    .profile-card__icon,
    .settings-row__icon {
      width: 38px;
      height: 38px;
    }

    .role {
      grid-column: 1 / -1;
      justify-self: start;
    }

    .details div {
      grid-template-columns: 1fr;
      gap: 5px;
    }

    .danger-panel {
      grid-template-columns: 1fr;
    }

    .primary-action,
    .secondary-action,
    .delete-action {
      width: 100%;
    }

    .dialog-actions {
      flex-direction: column-reverse;
    }

    .font-options {
      border-radius: var(--radius-md);
      grid-template-columns: 1fr;
    }

    .danger-actions,
    .actions {
      width: 100%;
    }

    .settings-row__content {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }
  }
</style>
