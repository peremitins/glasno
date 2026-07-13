import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/interview/[id].vue', 'utf8');

describe('interview participant profile', () => {
  it('uses the saved name and avatar in the local participant tile', () => {
    expect(source).toContain("import { useAuthStore } from '@/app/stores/auth'");
    expect(source).toContain('const participantName = computed(');
    expect(source).toContain("auth.user?.displayName?.trim() || t('interview.session.you')");
    expect(source).toContain(':avatar-url="auth.user?.avatarUrl"');
    expect(source).toContain('{{ participantName }}');
  });
});
