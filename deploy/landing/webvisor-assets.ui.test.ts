import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/deploy-prod.yml', 'utf8');
const nginx = readFileSync('deploy/landing/nginx.conf', 'utf8');

describe('landing Webvisor assets', () => {
  it('serves versioned Nuxt assets from persistent storage', () => {
    expect(nginx).toContain('location ^~ /_nuxt/');
    expect(nginx).toContain('root /srv/landing/webvisor-assets;');
  });

  it('keeps immutable assets only for the configured retention period', () => {
    expect(workflow).toContain('webvisor-assets/_nuxt');
    expect(workflow).toContain('WEBVISOR_ASSET_RETENTION_DAYS=30');
    expect(workflow).toContain('-mtime +');
  });

  it('does not expose an environment variable that overwrites the string counter ID', () => {
    expect(workflow).toContain("sed -i '/^NUXT_PUBLIC_YANDEX_METRIKA_ID=/d' .env");
    expect(workflow).not.toContain('NUXT_PUBLIC_YANDEX_METRIKA_ID:');
  });
});
