import { describe, expect, it } from 'vitest';
import {
  buildInterviewerGenderInstruction,
  getInterviewerGender,
  resolveRealtimeVoiceForFace,
  resolveTtsVoiceForFace,
} from './interviewerVoice';

describe('interviewer voice mapping', () => {
  it('derives gender from interviewer face id', () => {
    expect(getInterviewerGender('male-soft')).toBe('male');
    expect(getInterviewerGender('male-neutral')).toBe('male');
    expect(getInterviewerGender('female-strict')).toBe('female');
  });

  it('uses different TTS and realtime voices for male and female interviewers', () => {
    expect(resolveTtsVoiceForFace('male-neutral')).not.toBe(
      resolveTtsVoiceForFace('female-neutral')
    );
    expect(resolveRealtimeVoiceForFace('male-neutral')).not.toBe(
      resolveRealtimeVoiceForFace('female-neutral')
    );
  });

  it('builds grammar instruction for interviewer self-reference', () => {
    expect(buildInterviewerGenderInstruction('female')).toContain('поняла');
    expect(buildInterviewerGenderInstruction('male')).toContain('понял');
  });
});
