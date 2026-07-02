import { describe, expect, it } from 'vitest';
import { extractResumeText } from './extractResumeText';

describe('extractResumeText', () => {
  it('limits extracted resume context before it is sent to interview generation', async () => {
    const text = await extractResumeText({
      data: Buffer.from('опыт '.repeat(4_000), 'utf8'),
      fileName: 'resume.txt',
      mimeType: 'text/plain',
    });

    expect(text.length).toBeLessThanOrEqual(15_000);
  });
});
