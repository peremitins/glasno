import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  MAX_AVATAR_FILE_SIZE,
  normalizeAvatarImage,
} from './normalizeAvatarImage';

describe('normalizeAvatarImage', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    'принимает %s, сохраняет WebP и пропорции широкого изображения',
    async (format) => {
      const source = sharp({
        create: {
          width: 640,
          height: 320,
          channels: 3,
          background: '#613cf5',
        },
      });
      const input = await source[format]().toBuffer();

      const normalized = await normalizeAvatarImage(input);
      const metadata = await sharp(normalized).metadata();

      expect(metadata).toMatchObject({
        format: 'webp',
        width: 512,
        height: 256,
      });
    }
  );

  it('отклоняет поддельный MIME, если он не совпадает с реальным форматом', async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    await expect(normalizeAvatarImage(png, 'image/jpeg')).rejects.toThrow(
      'не совпадает'
    );
  });

  it('отклоняет недопустимый, повреждённый и слишком большой входной файл', async () => {
    await expect(normalizeAvatarImage(Buffer.from('not an image'))).rejects.toThrow(
      'JPEG, PNG или WebP'
    );
    await expect(
      normalizeAvatarImage(Buffer.alloc(MAX_AVATAR_FILE_SIZE + 1))
    ).rejects.toThrow('5 МБ');
  });

  it('отклоняет изображение с числом пикселей выше лимита', async () => {
    const oversized = await sharp({
      create: { width: 5_000, height: 5_000, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    await expect(normalizeAvatarImage(oversized)).rejects.toThrow('пикселей');
  });
});
