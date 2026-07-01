import { describe, expect, it } from 'vitest';
import { isAudioPlaybackBlockedError } from './useAudioPermissionGate';

describe('useAudioPermissionGate', () => {
  it('detects browser playback permission blocks', () => {
    expect(
      isAudioPlaybackBlockedError({
        name: 'NotAllowedError',
        message: 'play() failed because the user did not interact with the document first',
      })
    ).toBe(true);
    expect(
      isAudioPlaybackBlockedError({
        name: 'SecurityError',
        message: 'Autoplay policy blocked audio playback',
      })
    ).toBe(true);
  });

  it('does not treat unrelated media errors as permission blocks', () => {
    expect(
      isAudioPlaybackBlockedError({
        name: 'NotSupportedError',
        message: 'No supported source was found',
      })
    ).toBe(false);
  });
});
