import { describe, expect, it } from 'vitest';
import {
  calculateRealtimeVoiceUsageSeconds,
  resolveRealtimeVoiceEndAt,
} from './realtimeVoiceUsage';

describe('realtimeVoiceUsage', () => {
  it('caps an open session by idle timeout after last activity', () => {
    const usedSeconds = calculateRealtimeVoiceUsageSeconds(
      [
        {
          startedAt: new Date('2026-06-29T10:00:00.000Z'),
          lastActivityAt: new Date('2026-06-29T10:02:00.000Z'),
          endedAt: null,
        },
      ],
      {
        windowStart: new Date('2026-06-29T09:00:00.000Z'),
        windowEnd: new Date('2026-06-29T11:00:00.000Z'),
        idleTimeoutMs: 30_000,
        now: new Date('2026-06-29T10:20:00.000Z'),
      }
    );

    expect(usedSeconds).toBe(150);
  });

  it('counts only the part of a session inside the quota window', () => {
    const usedSeconds = calculateRealtimeVoiceUsageSeconds(
      [
        {
          startedAt: new Date('2026-06-29T09:58:30.000Z'),
          endedAt: new Date('2026-06-29T10:01:30.000Z'),
          lastActivityAt: new Date('2026-06-29T10:01:00.000Z'),
        },
      ],
      {
        windowStart: new Date('2026-06-29T10:00:00.000Z'),
        windowEnd: new Date('2026-06-29T11:00:00.000Z'),
        idleTimeoutMs: 30_000,
      }
    );

    expect(usedSeconds).toBe(90);
  });

  it('resolves end time by the earliest of now, hard limit and idle limit', () => {
    const endedAt = resolveRealtimeVoiceEndAt({
      startedAt: new Date('2026-06-29T10:00:00.000Z'),
      lastActivityAt: new Date('2026-06-29T10:03:00.000Z'),
      hardLimitMs: 10 * 60_000,
      idleTimeoutMs: 30_000,
      now: new Date('2026-06-29T10:09:00.000Z'),
    });

    expect(endedAt.toISOString()).toBe('2026-06-29T10:03:30.000Z');
  });
});
