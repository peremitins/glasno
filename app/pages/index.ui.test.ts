import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/index.vue', 'utf8');

describe('dashboard page UI structure', () => {
  it('keeps active session context inside the main preparation panel', () => {
    expect(source).toContain('active-inline');
    expect(source).not.toContain('active-card');
    expect(source).not.toContain('signal-pulse');
  });

  it('uses an adaptive dashboard with zero-state and returning-state layouts', () => {
    expect(source).toContain('hasSessions');
    expect(source).toContain('first-run-dashboard');
    expect(source).toContain('returning-dashboard');
    expect(source).toContain('how-it-works');
  });

  it('uses the standard format by default when the user has full access', () => {
    // Free-лимит покрывает только «Быстро» (3 вопроса), а полный доступ
    // должен сразу запускать стандартную репетицию из шести вопросов.
    expect(source).toContain('await billing.ensureLoaded()');
    expect(source).toContain('allowedSessionGoals.includes(\'standard\')');
    expect(source).toContain("sessionGoal: hasFullInterviewAccess.value ? 'standard' : 'quick'");
    expect(source).toContain('dashboard.standardDefault');
    expect(source).toContain('dashboard.launcherChipQuick');
    expect(source).not.toContain('dashboard-goal-picker');
  });

  it('offers role picker and resume file attach in the quick launcher', () => {
    expect(source).toContain('QuickStartSourceField');
    expect(source).toContain('QuickStartResumeField');
  });

  it('uses clearer trial-copy instead of free-limit wording', () => {
    expect(source).toContain('dashboard.trialUsage');
    expect(source).not.toContain('dashboard.stats.freeLimit');
    expect(source).not.toContain('Free-лимит');
  });
});
