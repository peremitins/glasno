import { PDFParse } from 'pdf-parse';
import { apiError } from '@/server/utils/errors';

const DEFAULT_MAX_BYTES = 6 * 1024 * 1024;
const DEFAULT_MAX_CHARS = 30_000;

export interface ExtractInterviewFileTextParams {
  data: Buffer;
  fileName?: string | null;
  mimeType?: string | null;
  maxBytes?: number;
  maxChars?: number;
  imageExtractor?: (params: {
    data: Buffer;
    fileName?: string | null;
    mimeType: string;
  }) => Promise<string>;
}

export async function extractInterviewFileText(
  params: ExtractInterviewFileTextParams
): Promise<string> {
  const maxBytes = params.maxBytes ?? DEFAULT_MAX_BYTES;
  if (params.data.byteLength > maxBytes) {
    throw apiError('E_VALIDATION', 'Файл должен быть меньше 6 МБ');
  }

  const fileName = params.fileName?.toLowerCase() || '';
  const mimeType = params.mimeType?.toLowerCase() || '';

  if (isTextFile(fileName, mimeType)) {
    return normalizeExtractedDocumentText(
      params.data.toString('utf8'),
      params.maxChars
    );
  }

  if (isPdfFile(fileName, mimeType)) {
    return extractPdfText(params);
  }

  if (isImageFile(fileName, mimeType)) {
    if (!params.imageExtractor) {
      throw apiError(
        'E_UPSTREAM',
        'Для извлечения текста из изображения нужен AI-экстрактор'
      );
    }
    const extracted = await params.imageExtractor({
      data: params.data,
      fileName: params.fileName,
      mimeType: mimeType || inferImageMimeType(fileName),
    });
    return normalizeExtractedDocumentText(extracted, params.maxChars);
  }

  throw apiError(
    'E_VALIDATION',
    'Поддерживаются PDF, TXT, Markdown, PNG и JPEG'
  );
}

export function normalizeExtractedDocumentText(
  value: string,
  maxChars = DEFAULT_MAX_CHARS
): string {
  const text = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) {
    throw apiError('E_VALIDATION', 'В файле не найден текст');
  }

  return text.slice(0, maxChars);
}

async function extractPdfText(
  params: ExtractInterviewFileTextParams
): Promise<string> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: params.data });
    const result = await parser.getText();
    return normalizeExtractedDocumentText(result.text, params.maxChars);
  } catch (err) {
    throw apiError('E_UPSTREAM', 'Не удалось извлечь текст из PDF', {
      cause: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await parser?.destroy();
  }
}

function isTextFile(fileName: string, mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType.includes('markdown') ||
    fileName.endsWith('.txt') ||
    fileName.endsWith('.md')
  );
}

function isPdfFile(fileName: string, mimeType: string): boolean {
  return mimeType.includes('pdf') || fileName.endsWith('.pdf');
}

function isImageFile(fileName: string, mimeType: string): boolean {
  return (
    mimeType === 'image/png' ||
    mimeType === 'image/jpeg' ||
    fileName.endsWith('.png') ||
    fileName.endsWith('.jpg') ||
    fileName.endsWith('.jpeg')
  );
}

function inferImageMimeType(fileName: string): string {
  return fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
}
