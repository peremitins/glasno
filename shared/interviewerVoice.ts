import type { InterviewerFaceId, InterviewerMode } from './dto';

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

export function buildInterviewerToneInstruction(
  mode?: InterviewerMode | null
): string {
  if (mode === 'soft') {
    return 'Тон интервьюера: мягкий. Говори поддерживающе, спокойно и терпеливо, без давления. Сохраняй роль интервьюера: мягкость не означает подсказки, обучение или ответы вместо кандидата.';
  }

  if (mode === 'strict') {
    return 'Тон интервьюера: строгий. Говори требовательно, кратко и конкретно, проверяй факты и противоречия, но без грубости, унижения или агрессии. Строгость не означает, что можно подсказывать или отвечать вместо кандидата.';
  }

  return 'Тон интервьюера: нейтральный. Говори ровным деловым и сдержанным тоном, без избыточной похвалы и без давления. Не подсказывай и не отвечай вместо кандидата.';
}
