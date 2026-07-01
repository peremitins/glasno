import { describe, expect, it } from 'vitest';
import {
  isWebMicrophonePermissionDeniedError,
  shouldBlockMicCaptureBeforeRequest,
  shouldShowMicDeniedFallbackAfterFailure,
} from './useMicPermissionGate';

describe('useMicPermissionGate', () => {
  it('shows fallback after the browser reports a denied microphone permission', () => {
    expect(
      shouldShowMicDeniedFallbackAfterFailure({
        priorPermissionState: 'prompt',
        currentPermissionState: 'denied',
        hadDeniedFlag: false,
      })
    ).toBe(true);
  });

  it('shows fallback if Safari reports prompt after a real denial', () => {
    expect(
      shouldShowMicDeniedFallbackAfterFailure({
        priorPermissionState: 'prompt',
        currentPermissionState: 'prompt',
        hadDeniedFlag: false,
      })
    ).toBe(true);
  });

  it('recognizes Safari-style microphone denial errors', () => {
    expect(
      isWebMicrophonePermissionDeniedError({
        name: 'NotAllowedError',
        message:
          'The request is not allowed by the user agent or the platform in the current context.',
      })
    ).toBe(true);
  });

  it('does not pre-block microphone capture in Safari after manual site permission changes', () => {
    expect(
      shouldBlockMicCaptureBeforeRequest({
        permissionState: 'denied',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      })
    ).toBe(false);
  });

  it('pre-blocks microphone capture in Chromium when permission state is denied', () => {
    expect(
      shouldBlockMicCaptureBeforeRequest({
        permissionState: 'denied',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      })
    ).toBe(true);
  });
});
