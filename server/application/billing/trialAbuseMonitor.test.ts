import { describe, expect, it, vi } from 'vitest';
import {
  TRIAL_ABUSE_ALERT_THRESHOLD,
  TRIAL_ABUSE_WINDOW_HOURS,
  checkTrialAbuse,
} from './trialAbuseMonitor';

function createDeps(trialCount: number) {
  return {
    countTrialSessionsByIpHashSince: vi.fn().mockResolvedValue(trialCount),
    notifyTrialAbuseSuspected: vi.fn().mockResolvedValue(undefined),
  };
}

describe('checkTrialAbuse', () => {
  it('stays silent while the trial count is below the threshold', async () => {
    const deps = createDeps(TRIAL_ABUSE_ALERT_THRESHOLD - 1);

    const result = await checkTrialAbuse(deps, 'hash');

    expect(result.alerted).toBe(false);
    expect(deps.notifyTrialAbuseSuspected).not.toHaveBeenCalled();
  });

  it('alerts once when the threshold is crossed', async () => {
    const deps = createDeps(TRIAL_ABUSE_ALERT_THRESHOLD);

    const result = await checkTrialAbuse(deps, 'a'.repeat(64));

    expect(result.alerted).toBe(true);
    expect(deps.notifyTrialAbuseSuspected).toHaveBeenCalledWith({
      trialCount: TRIAL_ABUSE_ALERT_THRESHOLD,
      windowHours: TRIAL_ABUSE_WINDOW_HOURS,
      ipHashPrefix: 'a'.repeat(12),
    });
  });

  it('does not repeat the alert for every later session', async () => {
    const deps = createDeps(TRIAL_ABUSE_ALERT_THRESHOLD + 7);

    const result = await checkTrialAbuse(deps, 'hash');

    expect(result.alerted).toBe(false);
    expect(deps.notifyTrialAbuseSuspected).not.toHaveBeenCalled();
  });

  it('counts within a 24 hour window', async () => {
    const deps = createDeps(1);
    const now = new Date('2026-07-23T12:00:00.000Z');

    await checkTrialAbuse(deps, 'hash', now);

    expect(deps.countTrialSessionsByIpHashSince).toHaveBeenCalledWith(
      'hash',
      new Date('2026-07-22T12:00:00.000Z')
    );
  });

  it('never leaks the raw ip — only a short hash prefix', async () => {
    const deps = createDeps(TRIAL_ABUSE_ALERT_THRESHOLD);
    const ipHash = 'abcdef0123456789'.repeat(4);

    await checkTrialAbuse(deps, ipHash);

    const params = deps.notifyTrialAbuseSuspected.mock.calls[0]?.[0];
    expect(params.ipHashPrefix).toHaveLength(12);
    expect(ipHash).toContain(params.ipHashPrefix);
  });
});
