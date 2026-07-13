import { NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { S3AvatarStorage } from './s3AvatarStorage';

describe('S3AvatarStorage', () => {
  it('использует только приватный ключ пользователя для Put/Get/Delete', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: { transformToByteArray: vi.fn().mockResolvedValue([1, 2, 3]) },
      })
      .mockResolvedValueOnce({});
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(send);

    const storage = new S3AvatarStorage({
      endpoint: 'https://storage.example.test',
      region: 'ru-central1',
      bucket: 'private-avatars',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    await storage.putAvatar('user-1', Buffer.from([1]));
    await expect(storage.getAvatar('user-1')).resolves.toEqual(Buffer.from([1, 2, 3]));
    await storage.deleteAvatar('user-1');

    expect(send.mock.calls.map(([command]) => command.input)).toEqual([
      {
        Bucket: 'private-avatars',
        Key: 'avatars/user-1.webp',
        Body: Buffer.from([1]),
        ContentType: 'image/webp',
      },
      { Bucket: 'private-avatars', Key: 'avatars/user-1.webp' },
      { Bucket: 'private-avatars', Key: 'avatars/user-1.webp' },
    ]);
  });

  it('возвращает null, когда приватного объекта нет', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(
      new NoSuchKey({ message: 'not found', $metadata: { httpStatusCode: 404 } })
    );
    const storage = new S3AvatarStorage({
      endpoint: 'https://storage.example.test',
      region: 'ru-central1',
      bucket: 'private-avatars',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });

    await expect(storage.getAvatar('user-1')).resolves.toBeNull();
  });

  it('прерывает зависший S3-запрос по таймауту', async () => {
    let abortSignal: AbortSignal | undefined;
    const send = vi.fn(
      (_command: unknown, options?: { abortSignal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          abortSignal = options?.abortSignal;
          if (!abortSignal) {
            reject(new Error('Не передан AbortSignal для S3-запроса'));
            return;
          }
          abortSignal.addEventListener(
            'abort',
            () => reject(abortSignal?.reason),
            { once: true }
          );
        })
    );
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(send as never);

    const storage = new S3AvatarStorage(
      {
        endpoint: 'https://storage.example.test',
        region: 'ru-central1',
        bucket: 'private-avatars',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
      20
    );

    await expect(storage.putAvatar('user-1', Buffer.from([1]))).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(abortSignal?.aborted).toBe(true);
  });
});
