import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getInterviewerFacePhotoSrc } from './interviewerAssets';
import type { InterviewerFaceId } from '@/shared/dto';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('getInterviewerFacePhotoSrc', () => {
  it('points every interviewer face to an existing public WebP image', () => {
    const faceIds: InterviewerFaceId[] = [
      'male-soft',
      'male-neutral',
      'male-strict',
      'female-soft',
      'female-neutral',
      'female-strict',
    ];

    for (const faceId of faceIds) {
      const src = getInterviewerFacePhotoSrc(faceId);

      expect(src).toBe(`/interviewers/${faceId}.webp`);
      expect(existsSync(`${repoRoot}/public${src}`)).toBe(true);
    }
  });
});
