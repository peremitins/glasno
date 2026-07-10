import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const authPage = readFileSync('app/pages/auth.vue', 'utf8');
const ruLocale = readFileSync('app/i18n/locales/ru.json', 'utf8');

describe('auth page', () => {
  it('uses a single passwordless entry form without signin/signup tabs', () => {
    expect(authPage).not.toContain('auth-tabs');
    expect(authPage).not.toContain('auth-tab');
    expect(authPage).not.toContain('setMode');
    expect(authPage).not.toContain('startEmailRegistration');
    expect(authPage).not.toContain('mode ===');
  });

  it('links terms and privacy from the confirmation text', () => {
    expect(ruLocale).toContain(
      'Продолжая, вы подтверждаете согласие с'
    );
    expect(authPage).toContain('termsOfServiceUrl');
    expect(authPage).toContain('privacyPolicyUrl');
    expect(authPage).toContain("t('auth.termsLink')");
    expect(authPage).toContain("t('auth.privacyLink')");
  });
});
