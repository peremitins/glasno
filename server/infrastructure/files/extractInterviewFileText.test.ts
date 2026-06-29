import { describe, expect, it } from 'vitest';
import { extractInterviewFileText } from './extractInterviewFileText';

describe('extractInterviewFileText', () => {
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
});
