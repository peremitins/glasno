import { describe, expect, it } from 'vitest';
import { AuthUserDto } from './auth';

const baseUser = {
  id: 'user-1',
  email: 'user@example.com',
  telegramId: null,
  telegramUsername: null,
  displayName: 'User',
  role: 'user',
  emailVerifiedAt: null,
  createdAt: '2026-07-09T07:00:00.000Z',
} as const;

describe('AuthUserDto onboarding flags', () => {
  it('exposes interview explain-selection onboarding as incomplete by default', () => {
    const parsed = AuthUserDto.parse(baseUser);

    expect(parsed.onboarding.interviewExplainSelection).toBe(false);
  });

  it('preserves completed interview explain-selection onboarding', () => {
    const parsed = AuthUserDto.parse({
      ...baseUser,
      onboarding: { interviewExplainSelection: true },
    });

    expect(parsed.onboarding.interviewExplainSelection).toBe(true);
  });
});
