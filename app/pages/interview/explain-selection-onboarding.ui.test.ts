import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('app/pages/interview/[id].vue', 'utf8');
const composablePath =
  'app/composables/useInterviewExplainSelectionOnboarding.ts';
const composable = existsSync(composablePath)
  ? readFileSync(composablePath, 'utf8')
  : '';

describe('interview explain-selection onboarding', () => {
  it('mounts the feature onboarding modal on the interview session page', () => {
    expect(page).toContain('InterviewExplainSelectionOnboardingModal');
    expect(page).toContain('showInterviewExplainSelectionOnboarding');
    expect(page).toContain('completeInterviewExplainSelectionOnboarding');
    expect(page).toContain('closeInterviewExplainSelectionOnboarding');
  });

  it('keeps dismiss local and sends the completion request only from the understood action', () => {
    expect(composable).toContain(
      '/api/user/onboarding/interview-explain-selection/complete'
    );
    expect(composable).toMatch(
      /function closeInterviewExplainSelectionOnboarding\(\) \{[\s\S]*?show\.value = false;[\s\S]*?\}/
    );
    expect(composable).toMatch(
      /async function completeInterviewExplainSelectionOnboarding\(\)[\s\S]*?api(?:<[^>]+>)?\([\s\S]*?method: 'POST'/
    );

    const closeFunction = composable.match(
      /function closeInterviewExplainSelectionOnboarding\(\) \{[\s\S]*?\n\}/
    )?.[0];
    expect(closeFunction).toBeTruthy();
    expect(closeFunction).not.toContain('api(');
  });
});
