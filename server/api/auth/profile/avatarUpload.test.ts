import { Readable } from 'node:stream';
import type { H3Event } from 'h3';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_AVATAR_MULTIPART_BODY_SIZE,
  readAvatarMultipartFile,
} from './avatarUpload';

function createEvent(
  chunks: Buffer[],
  headers: Record<string, string> = {}
): H3Event {
  const request = Object.assign(Readable.from(chunks), {
    headers,
    method: 'POST',
  });
  return { node: { req: request } } as unknown as H3Event;
}

describe('readAvatarMultipartFile', () => {
  it('отклоняет тело с заявленным размером выше лимита до чтения потока', async () => {
    const event = createEvent([Buffer.from('ignored')], {
      'content-type': 'multipart/form-data; boundary=avatar',
      'content-length': String(MAX_AVATAR_MULTIPART_BODY_SIZE + 1),
    });
    const request = event.node.req as unknown as {
      destroy: () => void;
      resume: () => void;
    };
    const resume = vi.spyOn(request, 'resume');
    const destroy = vi.spyOn(request, 'destroy');

    await expect(readAvatarMultipartFile(event)).rejects.toThrow('5 МБ');
    expect(resume).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('останавливает chunked-загрузку без Content-Length после лимита', async () => {
    const event = createEvent(
      [Buffer.alloc(MAX_AVATAR_MULTIPART_BODY_SIZE), Buffer.from([1])],
      { 'content-type': 'multipart/form-data; boundary=avatar' }
    );

    await expect(readAvatarMultipartFile(event)).rejects.toThrow('5 МБ');
  });

  it('кэширует ограниченное multipart-тело и извлекает единственный файл', async () => {
    const boundary = 'avatar-boundary';
    const body = Buffer.from(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="avatar.png"',
        'Content-Type: image/png',
        '',
        'image-bytes',
        `--${boundary}--`,
        '',
      ].join('\r\n')
    );
    const event = createEvent([body], {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    });

    const parseMultipart = vi.fn(async (receivedEvent: H3Event) => {
      expect((receivedEvent.node.req as { rawBody?: Buffer }).rawBody).toEqual(
        body
      );
      return [
        {
          data: Buffer.from('image-bytes'),
          name: 'file',
          filename: 'avatar.png',
          type: 'image/png',
        },
      ];
    });
    vi.stubGlobal('readMultipartFormData', parseMultipart);

    try {
      await expect(readAvatarMultipartFile(event)).resolves.toMatchObject({
        name: 'file',
        filename: 'avatar.png',
        type: 'image/png',
        data: Buffer.from('image-bytes'),
      });
      expect(parseMultipart).toHaveBeenCalledWith(event);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
