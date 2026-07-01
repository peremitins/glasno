import { describe, expect, it } from 'vitest';
import {
  isCameraPermissionDeniedError,
  shouldBlockCameraCaptureBeforeRequest,
  shouldShowCameraDeniedFallbackAfterFailure,
} from './useCameraPermissionGate';

describe('useCameraPermissionGate', () => {
  it('detects browser camera permission denial errors', () => {
    expect(
      isCameraPermissionDeniedError({
        name: 'NotAllowedError',
        message: 'Permission denied',
      })
    ).toBe(true);
  });

  it('ignores unrelated camera startup errors', () => {
    expect(
      isCameraPermissionDeniedError({
        name: 'NotReadableError',
        message: 'Camera is already in use',
      })
    ).toBe(false);
  });

  it('shows fallback after the browser reports a denied camera permission', () => {
    expect(
      shouldShowCameraDeniedFallbackAfterFailure({
        priorPermissionState: 'prompt',
        currentPermissionState: 'denied',
        hadDeniedFlag: false,
      })
    ).toBe(true);
  });

  it('shows fallback even if Safari reports prompt after a real denial', () => {
    expect(
      shouldShowCameraDeniedFallbackAfterFailure({
        priorPermissionState: 'prompt',
        currentPermissionState: 'prompt',
        hadDeniedFlag: false,
      })
    ).toBe(true);
  });
  it('recognizes Safari-style camera denial errors', () => {
    expect(
      isCameraPermissionDeniedError({
        name: 'NotAllowedError',
        message:
          'The request is not allowed by the user agent or the platform in the current context.',
      })
    ).toBe(true);
  });

  it('does not pre-block camera capture in Safari after manual site permission changes', () => {
    expect(
      shouldBlockCameraCaptureBeforeRequest({
        permissionState: 'denied',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      })
    ).toBe(false);
  });

  it('pre-blocks camera capture in Chromium when permission state is denied', () => {
    expect(
      shouldBlockCameraCaptureBeforeRequest({
        permissionState: 'denied',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      })
    ).toBe(true);
  });
});
