import { describe, expect, it } from 'vitest';
import {
  shouldDeferRealtimeIdleStop,
  shouldPhysicallyMuteRealtimeMicrophone,
} from './useRealtimeVoiceSession';

describe('useRealtimeVoiceSession helpers', () => {
  it('mutes outgoing microphone chunks during assistant output in Firefox', () => {
    expect(
      shouldPhysicallyMuteRealtimeMicrophone(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0'
      )
    ).toBe(true);
  });

  it('uses physical microphone mute in Chromium browsers', () => {
    expect(
      shouldPhysicallyMuteRealtimeMicrophone(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      )
    ).toBe(true);
  });

  it('does not physically disable the microphone track in Safari WebRTC sessions', () => {
    expect(
      shouldPhysicallyMuteRealtimeMicrophone(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
      )
    ).toBe(false);
  });

  it('defers idle stop while assistant output is still active', () => {
    expect(shouldDeferRealtimeIdleStop(1)).toBe(true);
    expect(shouldDeferRealtimeIdleStop(0)).toBe(false);
  });
});
