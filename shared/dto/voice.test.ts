import { describe, expect, it } from 'vitest';
import { RealtimeSessionResponseDto } from './voice';

describe('RealtimeSessionResponseDto', () => {
  it('returns the full session instructions needed for response overrides', () => {
    const parsed = RealtimeSessionResponseDto.parse({
      realtimeSessionId: 'realtime_1',
      clientSecret: null,
      expiresAt: null,
      model: 'gpt-realtime-mini',
      voice: 'marin',
      instructions: 'Ты голосовой интервьюер Гласно.',
      maxDurationSeconds: 300,
      idleTimeoutSeconds: 60,
      remainingSeconds: 300,
      realtimeLimits: {
        targetMinutes: 3,
        warningAtMinutes: 3,
        softLimitMinutes: 4,
        hardLimitMinutes: 5,
      },
    });

    expect(parsed.instructions).toBe('Ты голосовой интервьюер Гласно.');
  });
});
