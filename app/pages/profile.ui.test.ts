import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/profile.vue', 'utf8');

describe('profile page loading state', () => {
  it('renders a glass skeleton while billing status is loading lazily', () => {
    expect(source).toContain(
      "import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue'"
    );
    expect(source).toContain('useLazyAsyncData');
    expect(source).toContain('pending: billingPending');
    expect(source).toContain('profileBillingInitialPending');
    expect(source).toContain('billingPending.value && !billingStatus.value');
    expect(source).toContain('GlassSkeletonStack');
    expect(source).toContain('profile-skeleton');
    expect(source).toContain('v-if="auth.isAuthenticated && profileBillingInitialPending"');
  });

  it('shows access while the free interview is still available', () => {
    expect(source).toContain('billingStatus?.canCreateInterview');
  });

  it('keeps the Telegram identity row hidden without removing it', () => {
    expect(source).toContain('const showTelegramIdentity = false');
    expect(source).toContain('v-if="showTelegramIdentity"');
  });

  it('provides inline name editing and a staged avatar upload flow', () => {
    expect(source).toContain('v-model="profileDisplayName"');
    expect(source).toContain('saveDisplayName');
    expect(source).toContain('cancelDisplayNameEdit');
    expect(source).toContain('updateProfile');
    expect(source).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(source).toContain('avatarPreviewUrl');
    expect(source).toContain('saveAvatar');
    expect(source).toContain('deleteAvatar');
    expect(source).toContain("t('profile.avatar.hint')");
  });

  it('keeps passwordless fallback focused on email and OTP', () => {
    expect(source).not.toContain('v-model="form.displayName"');
    expect(source).toContain('auth.verifyEmailLogin(form.email, form.code)');
  });

  it('places avatar controls before name, email and user ID', () => {
    const avatar = source.indexOf('profile-avatar-settings');
    const name = source.indexOf('profile-name-row');
    const details = source.indexOf('<dl class="details">');

    expect(avatar).toBeGreaterThan(-1);
    expect(name).toBeGreaterThan(avatar);
    expect(details).toBeGreaterThan(name);
    expect(source).toContain('class="profile-edit-name profile-icon-action"');
    expect(source).toContain(':aria-label="t(\'profile.identity.edit\')"');
  });

  it('uses compact icon actions and a narrow label column for name editing', () => {
    expect(source).toContain('class="profile-name-row"');
    expect(source).toContain('class="profile-field-label"');
    expect(source).toContain('class="profile-inline-actions profile-inline-actions--icon"');
    expect(source).toContain(':aria-label="t(\'profile.identity.save\')"');
    expect(source).toContain(':aria-label="t(\'profile.identity.cancel\')"');
    expect(source).toContain('grid-template-columns: 88px minmax(0, 1fr) auto');
    expect(source).toContain('grid-template-columns: 88px minmax(0, 1fr);');
  });

  it('serializes profile mutations before allowing competing actions', () => {
    expect(source).toContain('const profileMutationKind = ref<');
    expect(source).toContain('const isProfileMutationPending = computed(');
    expect(source).toContain('const isProfileActionPending = computed(');
    expect(source).toContain('function beginProfileMutation(');
    expect(source).toContain("beginProfileMutation('display-name')");
    expect(source).toContain("beginProfileMutation('avatar-upload')");
    expect(source).toContain("beginProfileMutation('avatar-delete')");
    expect(source).toContain('if (isProfileActionPending.value) return;');
    expect(source).toContain(':disabled="auth.isSubmitting || isProfileActionPending"');
    expect(source).toContain(':disabled="isProfileActionPending"');
  });
});
