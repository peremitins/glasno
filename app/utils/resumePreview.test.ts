import { describe, expect, it } from 'vitest';
import { buildResumePreviewBlocks } from './resumePreview';

describe('buildResumePreviewBlocks', () => {
  it('does not truncate long resume previews to the first 24 lines', () => {
    const text = Array.from({ length: 32 }, (_, index) => `Строка ${index + 1}`).join(
      '\n'
    );

    const blocks = buildResumePreviewBlocks(text);

    expect(blocks).toHaveLength(32);
    expect(blocks.at(-1)).toMatchObject({ text: 'Строка 32' });
  });
});
