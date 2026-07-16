import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/deploy-prod.yml', 'utf8');
const nginx = readFileSync('deploy/landing/nginx.conf', 'utf8');
const compose = readFileSync('deploy/docker-compose.prod.yml', 'utf8');
const dockerfile = readFileSync('Dockerfile', 'utf8');
const appAssetsNginx = readFileSync('deploy/webvisor/nginx.conf', 'utf8');
const dockerignore = readFileSync('.dockerignore', 'utf8');

describe('landing Webvisor assets', () => {
  it('serves versioned Nuxt assets from persistent storage', () => {
    expect(nginx).toContain('location ^~ /_nuxt/');
    expect(nginx).toContain('root /srv/landing/webvisor-assets;');
  });

  it('keeps immutable assets only for the configured retention period', () => {
    expect(workflow).toContain('webvisor-assets/_nuxt');
    expect(workflow).toContain('WEBVISOR_ASSET_RETENTION_DAYS=30');
    expect(workflow).toContain('--ignore-times --no-times');
    expect(workflow).not.toContain('rsync -avz --ignore-existing');
    expect(workflow).toContain('-mtime +');
  });

  it('keeps application Nuxt assets across image replacements for Webvisor', () => {
    expect(compose).toContain(
      'webvisor-assets:/app/.output/public/_nuxt'
    );
    expect(compose).toContain('webvisor-static:');
    expect(compose).toContain('webvisor-assets:/srv/_nuxt:ro');
    expect(compose).toContain('PathPrefix(`/_nuxt/`)');
    expect(compose).toContain('webvisor-assets:');
    expect(dockerfile).toContain('/app/webvisor-assets-seed');
    expect(dockerfile).toContain('seed-webvisor-assets.sh');
    expect(dockerignore).toContain('!deploy/webvisor/seed-webvisor-assets.sh');
    expect(appAssetsNginx).toContain('location ^~ /_nuxt/');
    expect(appAssetsNginx).toContain('try_files $uri =404;');
    expect(workflow).toContain(
      'docker compose up -d --no-deps webvisor-static'
    );
    expect(workflow).toContain('seed_existing_webvisor_assets');
    expect(workflow).toContain('docker cp "$existing_web:/app/.output/public/_nuxt/." -');
    expect(workflow).toContain('deploy/docker-compose.prod.yml');
    expect(workflow).toContain('deploy/webvisor/nginx.conf');
  });

  it('does not expose an environment variable that overwrites the string counter ID', () => {
    expect(workflow).toContain("sed -i '/^NUXT_PUBLIC_YANDEX_METRIKA_ID=/d' .env");
    expect(workflow).not.toContain('NUXT_PUBLIC_YANDEX_METRIKA_ID:');
  });
});
