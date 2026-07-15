import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { utils, write } from 'xlsx';
import { extractInterviewFileText } from './extractInterviewFileText';

describe('extractInterviewFileText', () => {
  it('использует ESM-сборку xlsx без runtime-зависимости от cpexcel.js', () => {
    const source = readFileSync(
      'server/infrastructure/files/extractInterviewFileText.ts',
      'utf8'
    );

    expect(source).toContain("from 'xlsx/xlsx.mjs'");
    expect(source).not.toContain("from 'xlsx';");
  });

  it('явно включает canvas-полифиллы pdf-parse в production bundle', () => {
    const source = readFileSync(
      'server/infrastructure/files/extractInterviewFileText.ts',
      'utf8'
    );

    expect(source).toContain("import '@napi-rs/canvas';");
  });
  it('extracts readable text files without flattening all line breaks', async () => {
    const text = await extractInterviewFileText({
      data: Buffer.from('Вопрос 1?\n\n   Вопрос   2?   ', 'utf8'),
      fileName: 'questions.txt',
      mimeType: 'text/plain',
    });

    expect(text).toBe('Вопрос 1?\n\nВопрос 2?');
  });

  it('rejects unsupported files', async () => {
    await expect(
      extractInterviewFileText({
        data: Buffer.from('raw'),
        fileName: 'questions.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    ).rejects.toMatchObject({
      data: expect.objectContaining({
        code: 'E_VALIDATION',
      }),
    });
  });

  it('extracts readable CSV rows', async () => {
    const text = await extractInterviewFileText({
      data: Buffer.from('Вопрос,Тема\nРасскажите про конфликт?,soft skills', 'utf8'),
      fileName: 'questions.csv',
      mimeType: 'text/csv',
    });

    expect(text).toContain('Вопрос | Тема');
    expect(text).toContain('Расскажите про конфликт? | soft skills');
  });

  it('extracts readable Excel workbook rows', async () => {
    const workbook = utils.book_new();
    const worksheet = utils.aoa_to_sheet([
      ['Вопрос', 'Тема'],
      ['Как вы приоритизируете roadmap?', 'Продукт'],
    ]);
    utils.book_append_sheet(workbook, worksheet, 'План');
    const data = write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;

    const text = await extractInterviewFileText({
      data,
      fileName: 'questions.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    expect(text).toContain('Лист: План');
    expect(text).toContain('Вопрос | Тема');
    expect(text).toContain('Как вы приоритизируете roadmap? | Продукт');
  });
});
