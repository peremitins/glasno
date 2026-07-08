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

  it('keeps quick launchers on the dashboard to the standard 15-minute default', () => {
    expect(source).toContain("sessionGoal: 'standard'");
    expect(source).toContain('Стандарт · 15 мин');
    expect(source).not.toContain('dashboard-goal-picker');
  });

  it('uses clearer trial-copy instead of free-limit wording', () => {
    expect(source).toContain('dashboard.trialUsage');
    expect(source).not.toContain('dashboard.stats.freeLimit');
    expect(source).not.toContain('Free-лимит');
  });
});
