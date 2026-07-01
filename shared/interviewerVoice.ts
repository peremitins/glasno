import type { InterviewerFaceId } from './dto';

export type InterviewerGender = 'male' | 'female';

const TTS_VOICE_BY_GENDER: Record<InterviewerGender, string> = {
  male: 'onyx',
  female: 'nova',
};

const REALTIME_VOICE_BY_GENDER: Record<InterviewerGender, string> = {
  male: 'cedar',
  female: 'marin',
};

export function getInterviewerGender(
  faceId?: InterviewerFaceId | null
): InterviewerGender {
  return faceId?.startsWith('female-') ? 'female' : 'male';
}

export function resolveTtsVoiceForFace(
  faceId?: InterviewerFaceId | null
): string {
  return TTS_VOICE_BY_GENDER[getInterviewerGender(faceId)];
}

export function resolveRealtimeVoiceForFace(
  faceId?: InterviewerFaceId | null
): string {
  return REALTIME_VOICE_BY_GENDER[getInterviewerGender(faceId)];
}

export function buildInterviewerGenderInstruction(
  gender: InterviewerGender
): string {
  if (gender === 'female') {
    return 'Пол интервьюера: женский. Говори о себе в женском роде: «поняла», «готова», «могу уточнить». Не используй мужской род для реплик от своего лица.';
  }

  return 'Пол интервьюера: мужской. Говори о себе в мужском роде: «понял», «готов», «могу уточнить». Не используй женский род для реплик от своего лица.';
}
