import { S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

const storageEnvironmentKeys = [
  'STORAGE_ENDPOINT',
  'STORAGE_REGION',
  'STORAGE_BUCKET',
  'ACCESS_KEY_ID',
  'SECRET_ACCESS_KEY',
] as const;

function runtimeConfig(bucket = 'private-avatars'): Record<string, unknown> {
  return {
    storageEndpoint: 'https://storage.example.test',
    storageRegion: 'ru-central1',
    storageBucket: bucket,
    storageAccessKeyId: 'key',
    storageSecretAccessKey: 'secret',
  };
}

describe('getCachedAvatarStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('переиспользует клиент при той же конфигурации и закрывает его при смене', async () => {
    for (const key of storageEnvironmentKeys) {
      vi.stubEnv(key, '');
    }
    const destroy = vi.spyOn(S3Client.prototype, 'destroy');
    const { getCachedAvatarStorage } = await import('./serviceFactory');

    const first = getCachedAvatarStorage(runtimeConfig());
    const sameConfig = getCachedAvatarStorage(runtimeConfig());
    const changedConfig = getCachedAvatarStorage(runtimeConfig('other-bucket'));

    expect(sameConfig).toBe(first);
    expect(changedConfig).not.toBe(first);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
