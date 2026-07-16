import sharp, { type Metadata } from 'sharp';
import { apiError } from '@/server/utils/errors';

export const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_AVATAR_PIXELS = 20_000_000;
export const AVATAR_SIZE = 512;

const MIME_BY_FORMAT = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

type SupportedAvatarFormat = keyof typeof MIME_BY_FORMAT;

const ALLOWED_AVATAR_MIME_TYPES = new Set<string>(Object.values(MIME_BY_FORMAT));

function invalidAvatarFormatError() {
  return apiError(
    'E_VALIDATION',
    'Поддерживаются только изображения JPEG, PNG или WebP'
  );
}

function normalizeMimeType(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split(';', 1)[0]?.trim().toLowerCase() || null;
}

function isSupportedAvatarFormat(
  format: string | undefined
): format is SupportedAvatarFormat {
  return format === 'jpeg' || format === 'png' || format === 'webp';
}

// Декодируем изображение на сервере, не доверяя MIME из multipart. Sharp
// применяет EXIF-ориентацию и устраняет метаданные при сохранении нового WebP.
export async function normalizeAvatarImage(
  input: Buffer,
  declaredMimeType: string | null = null
): Promise<Buffer> {
  if (input.length === 0) {
    throw invalidAvatarFormatError();
  }
  if (input.length > MAX_AVATAR_FILE_SIZE) {
    throw apiError('E_VALIDATION', 'Размер файла аватара не должен превышать 5 МБ');
  }

  const mimeType = normalizeMimeType(declaredMimeType);
  if (mimeType && !ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    throw invalidAvatarFormatError();
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(input, {
      failOn: 'error',
      limitInputPixels: MAX_AVATAR_PIXELS,
    }).metadata();
  } catch (error) {
    if (error instanceof Error && /pixel/i.test(error.message)) {
      throw apiError(
        'E_VALIDATION',
        'Размер изображения превышает допустимое число пикселей'
      );
    }
    throw invalidAvatarFormatError();
  }

  const format = metadata.format;
  if (!isSupportedAvatarFormat(format)) {
    throw invalidAvatarFormatError();
  }

  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > MAX_AVATAR_PIXELS
  ) {
    throw apiError(
      'E_VALIDATION',
      'Размер изображения превышает допустимое число пикселей'
    );
  }

  if (mimeType && mimeType !== MIME_BY_FORMAT[format]) {
    throw apiError(
      'E_VALIDATION',
      'Тип загруженного файла не совпадает с его содержимым'
    );
  }

  try {
    return await sharp(input, {
      failOn: 'error',
      limitInputPixels: MAX_AVATAR_PIXELS,
    })
      .rotate()
      // Ограничиваем размер, но не обрезаем фото до квадрата: аватар может
      // использоваться как полноразмерный кадр в плитке видеозвонка.
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'inside' })
      .webp({ quality: 86, effort: 4 })
      .toBuffer();
  } catch (error) {
    if (error instanceof Error && /pixel/i.test(error.message)) {
      throw apiError(
        'E_VALIDATION',
        'Размер изображения превышает допустимое число пикселей'
      );
    }
    throw invalidAvatarFormatError();
  }
}
