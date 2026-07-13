import { describe, expect, it } from 'vitest';
import {
  buildInterviewerGenderInstruction,
  buildInterviewerToneInstruction,
  getInterviewerGender,
  resolveRealtimeVoiceForFace,
  resolveTtsVoiceForFace,
} from './interviewerVoice';

describe('interviewer voice mapping', () => {
  it('derives gender from interviewer face id', () => {
    const cases = [
      ['male-soft', 'male'],
      ['male-neutral', 'male'],
      ['male-strict', 'male'],
      ['female-soft', 'female'],
      ['female-neutral', 'female'],
      ['female-strict', 'female'],
    ] as const;

    for (const [faceId, gender] of cases) {
      expect(getInterviewerGender(faceId)).toBe(gender);
    }
  });

  it('uses different TTS and realtime voices for male and female interviewers', () => {
    const maleTtsVoice = resolveTtsVoiceForFace('male-neutral');
    const femaleTtsVoice = resolveTtsVoiceForFace('female-neutral');
    const maleRealtimeVoice = resolveRealtimeVoiceForFace('male-neutral');
    const femaleRealtimeVoice = resolveRealtimeVoiceForFace('female-neutral');

    expect(maleTtsVoice).not.toBe(femaleTtsVoice);
    expect(maleRealtimeVoice).not.toBe(femaleRealtimeVoice);
    for (const tone of ['soft', 'neutral', 'strict'] as const) {
      expect(resolveTtsVoiceForFace(`male-${tone}`)).toBe(maleTtsVoice);
      expect(resolveTtsVoiceForFace(`female-${tone}`)).toBe(femaleTtsVoice);
      expect(resolveRealtimeVoiceForFace(`male-${tone}`)).toBe(
        maleRealtimeVoice
      );
      expect(resolveRealtimeVoiceForFace(`female-${tone}`)).toBe(
        femaleRealtimeVoice
      );
    }
  });

  it('builds grammar instruction for interviewer self-reference', () => {
    expect(buildInterviewerGenderInstruction('female')).toContain('поняла');
    expect(buildInterviewerGenderInstruction('male')).toContain('понял');
  });

  it.each([
    ['soft', 'мягкий', 'поддерживающе'],
    ['neutral', 'нейтральный', 'деловым'],
    ['strict', 'строгий', 'требовательно'],
  ] as const)('turns %s mode into explicit tone behavior', (mode, label, behavior) => {
    const instruction = buildInterviewerToneInstruction(mode);

    expect(instruction).toContain(label);
    expect(instruction).toContain(behavior);
  });
});
