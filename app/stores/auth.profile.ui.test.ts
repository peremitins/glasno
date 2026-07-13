import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/stores/auth.ts', 'utf8');

describe('auth profile client contract', () => {
  it('sends the optional name only with OTP verification', () => {
    expect(source).toContain('async function verifyEmailLogin(');
    expect(source).toContain('displayName?: string');
    expect(source).toContain('body: { email, code, displayName }');
  });

  it('updates local user data after profile and avatar mutations', () => {
    expect(source).toContain("'/api/auth/profile'");
    expect(source).toContain("'/api/auth/profile/avatar'");
    expect(source).toContain('async function updateProfile(displayName: string | null)');
    expect(source).toContain('async function uploadAvatar(file: File)');
    expect(source).toContain('async function deleteAvatar()');
    expect(source).toContain('user.value = response.user');
  });
});
