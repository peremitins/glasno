import { PDFParse } from 'pdf-parse';
import { read, utils } from 'xlsx';
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

  if (isSpreadsheetFile(fileName, mimeType)) {
    return extractSpreadsheetText(params);
  }

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
    'Поддерживаются PDF, TXT, Markdown, CSV, Excel, PNG и JPEG'
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

function isSpreadsheetFile(fileName: string, mimeType: string): boolean {
  return (
    isCsvFile(fileName, mimeType) ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    fileName.endsWith('.xls') ||
    fileName.endsWith('.xlsx')
  );
}

function isCsvFile(fileName: string, mimeType: string): boolean {
  return mimeType.includes('csv') || fileName.endsWith('.csv');
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

function extractSpreadsheetText(
  params: ExtractInterviewFileTextParams
): string {
  try {
    const fileName = params.fileName?.toLowerCase() || '';
    const mimeType = params.mimeType?.toLowerCase() || '';
    const workbook = isCsvFile(fileName, mimeType)
      ? read(params.data.toString('utf8'), {
          type: 'string',
          cellDates: true,
          raw: false,
        })
      : read(params.data, {
          type: 'buffer',
          cellDates: true,
          raw: false,
        });
    const sections: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = utils.sheet_to_json<Array<string | number | boolean | null>>(
        sheet,
        {
          header: 1,
          blankrows: false,
          defval: '',
          raw: false,
        }
      );
      const lines = rows
        .map((row) =>
          row
            .map((cell) => String(cell ?? '').replace(/[ \t]+/g, ' ').trim())
            .filter(Boolean)
            .join(' | ')
        )
        .filter(Boolean);
      if (lines.length) {
        sections.push([`Лист: ${sheetName}`, ...lines].join('\n'));
      }
    }

    return normalizeExtractedDocumentText(
      sections.join('\n\n'),
      params.maxChars
    );
  } catch (err) {
    throw apiError('E_UPSTREAM', 'Не удалось извлечь текст из таблицы', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}
