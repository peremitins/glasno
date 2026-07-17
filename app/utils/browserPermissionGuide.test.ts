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

  it('detects Chrome on iOS (CriOS) as chrome + ios', () => {
    const env = detectBrowserPermissionEnvironment({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });

    expect(env.browser).toBe('chrome');
    expect(env.device).toBe('ios');
  });

  it('sends iOS Chrome users to the iOS app settings toggles', () => {
    const guide = buildBrowserPermissionGuide('microphone', {
      browser: 'chrome',
      device: 'ios',
    });

    const steps = guide.steps.join(' ');
    expect(steps).toContain('Настройки iPhone');
    expect(steps).toContain('Chrome');
    expect(steps).toContain('Микрофон');
    expect(steps).not.toContain('Site settings');
  });

  it('offers reload-first recovery for iOS Safari microphone', () => {
    const guide = buildBrowserPermissionGuide('microphone', {
      browser: 'safari',
      device: 'ios',
    });

    expect(guide.steps[0]).toContain('Обновить страницу');
    const steps = guide.steps.join(' ');
    expect(steps).toContain('Настройки веб-сайта');
    expect(steps).toContain('Настройки iPhone');
  });

  it('gives Android Chrome its own site-permissions steps', () => {
    const guide = buildBrowserPermissionGuide('camera', {
      browser: 'chrome',
      device: 'android',
    });

    const steps = guide.steps.join(' ');
    expect(steps).toContain('Разрешения');
    expect(steps).toContain('Настройки сайтов');
    expect(steps).toContain('Камера');
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
