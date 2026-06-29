import { describe, expect, it } from 'vitest';
import { extractResumeText } from './extractResumeText';

describe('extractResumeText', () => {
  it('keeps readable line breaks for text resumes', async () => {
    const text = await extractResumeText({
      data: Buffer.from(
        'Опыт\n\n   Senior Product Manager   \n\nНавыки\nA/B тесты   аналитика',
        'utf8'
      ),
      fileName: 'resume.txt',
      mimeType: 'text/plain',
    });

    expect(text).toBe('Опыт\n\nSenior Product Manager\n\nНавыки\nA/B тесты аналитика');
  });

  it('uses the provided image extractor for image resumes', async () => {
    const text = await extractResumeText({
      data: Buffer.from('image-bytes'),
      fileName: 'resume.png',
      mimeType: 'image/png',
      imageExtractor: async (image) => {
        expect(image.mimeType).toBe('image/png');
        return 'Опыт\nVue, Nuxt, дизайн-системы';
      },
    });

    expect(text).toBe('Опыт\nVue, Nuxt, дизайн-системы');
  });
});
