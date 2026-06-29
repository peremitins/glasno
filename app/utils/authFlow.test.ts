import { describe, expect, it } from 'vitest';
import {
  normalizeEmailCode,
  resolveAuthMode,
  resolveSafeNextPath,
} from './authFlow';

describe('authFlow', () => {
  it('opens signup for signup/register query modes and signin by default', () => {
    expect(resolveAuthMode('signup')).toBe('signup');
    expect(resolveAuthMode('register')).toBe('signup');
    expect(resolveAuthMode(['register'])).toBe('signup');
    expect(resolveAuthMode('signin')).toBe('signin');
    expect(resolveAuthMode(undefined)).toBe('signin');
  });

  it('keeps only safe internal redirect paths', () => {
    expect(resolveSafeNextPath('/interview/new')).toBe('/interview/new');
    expect(resolveSafeNextPath(['/history'])).toBe('/history');
    expect(resolveSafeNextPath('https://evil.example')).toBe('/');
    expect(resolveSafeNextPath('//evil.example')).toBe('/');
    expect(resolveSafeNextPath(undefined)).toBe('/');
  });

  it('normalizes email verification code to six digits', () => {
    expect(normalizeEmailCode('12 a 34-567')).toBe('123456');
    expect(normalizeEmailCode('abc')).toBe('');
  });
});
