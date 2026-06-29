import { PDFParse } from 'pdf-parse';
import { apiError } from '@/server/utils/errors';

const MAX_RESUME_BYTES = 6 * 1024 * 1024;

export async function extractResumeText(params: {
  data: Buffer;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<string> {
  if (params.data.byteLength > MAX_RESUME_BYTES) {
    throw apiError('E_VALIDATION', 'Файл резюме должен быть меньше 6 МБ');
  }

  const fileName = params.fileName?.toLowerCase() || '';
  const mimeType = params.mimeType?.toLowerCase() || '';
  const isPdf = mimeType.includes('pdf') || fileName.endsWith('.pdf');
  const isText =
    mimeType.startsWith('text/') ||
    fileName.endsWith('.txt') ||
    fileName.endsWith('.md');

  if (isText) {
    return normalizeExtractedText(params.data.toString('utf8'));
  }

  if (isPdf) {
    let parser: PDFParse | null = null;
    try {
      parser = new PDFParse({ data: params.data });
      const result = await parser.getText();
      return normalizeExtractedText(result.text);
    } catch (err) {
      throw apiError('E_UPSTREAM', 'Не удалось извлечь текст из PDF', {
        cause: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await parser?.destroy();
    }
  }

  throw apiError('E_VALIDATION', 'Поддерживаются только PDF и текстовые резюме');
}

function normalizeExtractedText(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) {
    throw apiError('E_VALIDATION', 'В файле не найден текст резюме');
  }
  return text.slice(0, 30_000);
}
