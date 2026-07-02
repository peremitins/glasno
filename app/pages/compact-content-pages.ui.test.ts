import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compactPages = [
  'app/pages/history.vue',
  'app/pages/questions.vue',
  'app/pages/pricing.vue',
  'app/pages/profile.vue',
];

describe('compact content pages', () => {
  it('does not render redundant explanatory page headers', () => {
    for (const file of compactPages) {
      const source = readFileSync(file, 'utf8');

      expect(source, file).not.toContain('app-page-header');
      expect(source, file).not.toContain('page-subtitle');
    }
  });

  it('lets users delete interview history items with confirmation', () => {
    const source = readFileSync('app/pages/history.vue', 'utf8');

    expect(source).toContain('TrashIcon');
    expect(source).toContain('confirmDeleteSession');
    expect(source).toContain('deleteSession');
    expect(source).toContain("method: 'DELETE'");
    expect(source).toContain('history.delete.title');
    expect(source).toContain('history.delete.confirm');
  });

  it('turns profile into a settings hub without duplicated account identity', () => {
    const source = readFileSync('app/pages/profile.vue', 'utf8');
    const authStore = readFileSync('app/stores/auth.ts', 'utf8');

    expect(source).not.toContain('profile.account.signedInAs');
    expect(source).not.toContain('const identity = computed');
    expect(source).toContain("auth.user?.role === 'admin'");
    expect(source).toContain('profile.account.adminRole');
    expect(source).toContain('profile.sections.subscription');
    expect(source).toContain('profile.sections.documents');
    expect(source).toContain('profile.delete.title');
    expect(source).toContain('auth.deleteAccount()');
    expect(authStore).toContain("method: 'DELETE'");
  });
});
