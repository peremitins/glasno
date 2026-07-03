import { describe, expect, it } from 'vitest';
import {
  buildBrowserPermissionGuide,
  detectBrowserPermissionEnvironment,
} from './browserPermissionGuide';

describe('browserPermissionGuide', () => {
  it('detects desktop Chrome from user agent', () => {
    const env = detectBrowserPermissionEnvironment({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });

    expect(env.browser).toBe('chrome');
    expect(env.device).toBe('desktop');
  });

  it('detects iOS Safari separately from desktop Safari', () => {
    const env = detectBrowserPermissionEnvironment({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });

    expect(env.browser).toBe('safari');
    expect(env.device).toBe('ios');
  });

  it('builds browser-specific microphone instructions without product name', () => {
    const guide = buildBrowserPermissionGuide('microphone', {
      browser: 'chrome',
      device: 'desktop',
    });

    expect(guide.copy).toContain('микрофон');
    expect(guide.copy).not.toContain('Гласно');
    expect(guide.steps.join(' ')).toContain('иконку слева от адреса');
  });

  it('uses Safari website settings for desktop Safari camera instructions', () => {
    const guide = buildBrowserPermissionGuide('camera', {
      browser: 'safari',
      device: 'desktop',
    });

    expect(guide.steps.join(' ')).toContain('Safari');
    expect(guide.steps.join(' ')).toContain('Websites');
    expect(guide.steps.join(' ')).toContain('localhost');
    expect(guide.steps.join(' ')).not.toContain('Settings for This Website');
  });

  it('uses Safari website settings for desktop Safari microphone instructions', () => {
    const guide = buildBrowserPermissionGuide('microphone', {
      browser: 'safari',
      device: 'desktop',
    });

    expect(guide.steps.join(' ')).toContain('Settings');
    expect(guide.steps.join(' ')).toContain('Websites');
    expect(guide.steps.join(' ')).toContain('Microphone');
    expect(guide.steps.join(' ')).toContain('localhost');
  });
});
