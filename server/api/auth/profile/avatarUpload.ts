import type { H3Event, MultiPartData } from 'h3';
import { MAX_AVATAR_FILE_SIZE } from '@/server/infrastructure/files/normalizeAvatarImage';
import { apiError } from '@/server/utils/errors';

// Multipart добавляет boundary и служебные заголовки сверх лимита самого файла.
export const MAX_AVATAR_MULTIPART_OVERHEAD = 64 * 1024;
export const MAX_AVATAR_MULTIPART_BODY_SIZE =
  MAX_AVATAR_FILE_SIZE + MAX_AVATAR_MULTIPART_OVERHEAD;

type AvatarUploadRequest = H3Event['node']['req'] & {
  rawBody?: Buffer;
};

function tooLargeError() {
  return apiError('E_VALIDATION', 'Размер файла аватара не должен превышать 5 МБ');
}

function parseContentLength(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const length = Number(raw);
  return Number.isSafeInteger(length) ? length : null;
}

// H3 1.x буферизует multipart без лимита. Сначала читаем node-stream сами и
// кладём ограниченный Buffer в rawBody — затем штатный H3-парсер использует
// именно его, не читая поток повторно.
async function cacheBoundedMultipartBody(event: H3Event): Promise<void> {
  const request = event.node.req as AvatarUploadRequest;
  const declaredLength = parseContentLength(request.headers['content-length']);
  if (
    declaredLength !== null &&
    declaredLength > MAX_AVATAR_MULTIPART_BODY_SIZE
  ) {
    // Не закрываем сокет до defineApiHandler: дренируем остаток асинхронно,
    // чтобы клиент получил структурированную 400-ошибку, а память не росла.
    request.resume();
    throw tooLargeError();
  }

  if (Buffer.isBuffer(request.rawBody)) {
    if (request.rawBody.length > MAX_AVATAR_MULTIPART_BODY_SIZE) {
      throw tooLargeError();
    }
    return;
  }

  const chunks: Buffer[] = [];
  let totalLength = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buffer.length;
    if (totalLength > MAX_AVATAR_MULTIPART_BODY_SIZE) {
      request.resume();
      throw tooLargeError();
    }
    chunks.push(buffer);
  }
  request.rawBody = Buffer.concat(chunks, totalLength);
}

export async function readAvatarMultipartFile(
  event: H3Event
): Promise<MultiPartData> {
  await cacheBoundedMultipartBody(event);
  const parts = await readMultipartFormData(event);
  const fileParts = (parts ?? []).filter((part) => Boolean(part.filename));
  const file = fileParts[0];
  if (fileParts.length !== 1 || file?.name !== 'file' || !file.data) {
    throw apiError('E_VALIDATION', 'Прикрепите один файл аватара в поле file');
  }
  return file;
}
