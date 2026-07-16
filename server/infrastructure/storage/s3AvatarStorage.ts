import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { AvatarStorage } from '@/server/interface/avatarStorage';
import { apiError } from '@/server/utils/errors';

export interface S3AvatarStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Длинная сторона аватара ограничена 512 px, поэтому десяти секунд достаточно даже для
// медленного S3-compatible endpoint. AbortSignal ограничивает весь запрос,
// включая повторные попытки SDK, а не только установление соединения.
export const S3_AVATAR_REQUEST_TIMEOUT_MS = 10_000;

function avatarKey(userId: string): string {
  return `avatars/${userId}.webp`;
}

function isObjectNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const namedError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    namedError.name === 'NoSuchKey' ||
    namedError.name === 'NotFound' ||
    namedError.$metadata?.httpStatusCode === 404
  );
}

function resolveValue(
  runtimeConfig: Record<string, unknown>,
  configKey: string,
  environmentKey: string,
  fallback = ''
): string {
  // Raw STORAGE_* переменные читаются в runtime внутри контейнера. Это важно
  // для Nitro: `runtimeConfig` может быть собран до появления prod-.env.
  const environmentValue = process.env[environmentKey]?.trim();
  if (environmentValue) return environmentValue;

  const configured = runtimeConfig[configKey];
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim();
  }
  return fallback;
}

// Проверка выполняется только при первом обращении к аватару: email/Telegram
// вход остаётся доступным, пока S3 ещё не настроен в окружении.
export function resolveS3AvatarStorageConfig(
  runtimeConfig: Record<string, unknown>
): S3AvatarStorageConfig {
  const config: S3AvatarStorageConfig = {
    endpoint: resolveValue(runtimeConfig, 'storageEndpoint', 'STORAGE_ENDPOINT'),
    region: resolveValue(runtimeConfig, 'storageRegion', 'STORAGE_REGION'),
    bucket: resolveValue(runtimeConfig, 'storageBucket', 'STORAGE_BUCKET'),
    accessKeyId: resolveValue(
      runtimeConfig,
      'storageAccessKeyId',
      'ACCESS_KEY_ID'
    ),
    secretAccessKey: resolveValue(
      runtimeConfig,
      'storageSecretAccessKey',
      'SECRET_ACCESS_KEY'
    ),
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw apiError(
      'E_UPSTREAM',
      'Хранилище аватаров не настроено',
      { missing }
    );
  }

  return config;
}

export class S3AvatarStorage implements AvatarStorage {
  private readonly client: S3Client;

  constructor(
    private readonly config: S3AvatarStorageConfig,
    private readonly requestTimeoutMs = S3_AVATAR_REQUEST_TIMEOUT_MS
  ) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      // Поддерживаем S3-compatible endpoint-ы с path-style адресацией.
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  // Не входит в AvatarStorage: lifecycle S3-клиента нужен только фабрике.
  destroy(): void {
    this.client.destroy();
  }

  async putAvatar(userId: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: avatarKey(userId),
        Body: data,
        ContentType: 'image/webp',
      }),
      this.requestOptions()
    );
  }

  async getAvatar(userId: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: avatarKey(userId),
        }),
        this.requestOptions()
      );
      const body = result.Body as
        | { transformToByteArray?: () => Promise<Uint8Array> }
        | undefined;
      if (!body?.transformToByteArray) {
        throw new Error('S3 не вернул содержимое аватара');
      }
      return Buffer.from(await body.transformToByteArray());
    } catch (error) {
      if (isObjectNotFound(error)) return null;
      throw error;
    }
  }

  async deleteAvatar(userId: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: avatarKey(userId),
      }),
      this.requestOptions()
    );
  }

  private requestOptions(): { abortSignal: AbortSignal } {
    return { abortSignal: AbortSignal.timeout(this.requestTimeoutMs) };
  }
}
