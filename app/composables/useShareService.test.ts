import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareServiceContent } from './useShareService';

const input = {
  title: 'Гласно: тренажёр собеседований',
  text: 'Попробуй Гласно. Здесь можно отрепетировать собеседование по своей вакансии и получить разбор ответов.',
  url: 'https://glasno.app',
  imageUrl: '/brand/logo.png',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('shareServiceContent', () => {
  it('shares an image when the platform accepts files and keeps the URL in text', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { share, canShare, clipboard: undefined });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['logo'], { type: 'image/png' }),
      })
    );

    await expect(shareServiceContent(input)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: input.title,
        text: `${input.text}\n\n${input.url}`,
        files: [expect.any(File)],
      })
    );
    expect(share.mock.calls[0]?.[0]).not.toHaveProperty('url');
  });

  it('copies prepared text and the URL when native sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(shareServiceContent(input)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(`${input.text}\n\n${input.url}`);
  });

  it('does not copy anything when the user cancels the native share sheet', async () => {
    const error = new Error('cancelled');
    error.name = 'AbortError';
    const share = vi.fn().mockRejectedValue(error);
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { share, clipboard: { writeText } });

    await expect(shareServiceContent(input)).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });
});
