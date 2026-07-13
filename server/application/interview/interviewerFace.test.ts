import { describe, expect, it } from 'vitest';
import { avatarFromMode, modeFromFaceId } from './interviewerFace';

describe('interviewer face mapping', () => {
  it.each([
    ['male-soft', 'soft', 'warm-hr'],
    ['female-soft', 'soft', 'warm-hr'],
    ['male-neutral', 'neutral', 'neutral-pro'],
    ['female-neutral', 'neutral', 'neutral-pro'],
    ['male-strict', 'strict', 'strict-lead'],
    ['female-strict', 'strict', 'strict-lead'],
  ] as const)(
    'maps %s to the %s model tone and matching avatar',
    (faceId, mode, avatar) => {
      expect(modeFromFaceId(faceId)).toBe(mode);
      expect(avatarFromMode(mode)).toBe(avatar);
    }
  );
});
