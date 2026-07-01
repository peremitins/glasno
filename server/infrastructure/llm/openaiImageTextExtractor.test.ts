import { describe, expect, it } from 'vitest';
import {
  normalizeImageExtractionText,
  resolveImageExtractionModel,
} from './openaiImageTextExtractor';

describe('openaiImageTextExtractor helpers', () => {
  it('rejects model refusal text instead of treating it as extracted content', () => {
    expect(() =>
      normalizeImageExtractionText('Извините, я не могу помочь с этой просьбой.')
    ).toThrow('Не удалось извлечь текст');
  });

  it('keeps OCR text with readable line breaks', () => {
    expect(
      normalizeImageExtractionText('  Опыт\n\nFrontend Developer  ')
    ).toBe('Опыт\n\nFrontend Developer');
  });

  it('uses a cheap dedicated vision extraction model by default', () => {
    expect(resolveImageExtractionModel({})).toBe('gpt-4o-mini');
    expect(
      resolveImageExtractionModel({
        NUXT_OPENAI_VISION_EXTRACT_MODEL: 'gpt-4.1-mini',
      })
    ).toBe('gpt-4.1-mini');
  });
});
