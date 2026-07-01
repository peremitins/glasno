import type {
  InterviewerAvatarId,
  InterviewerFaceId,
  InterviewerMode,
} from '@/shared/dto';

// Внешность интервьюера кодируется как <gender>-<mode>. Тон (mode) часть
// определяет поведение ИИ, поэтому смена лица меняет и тон, и картинку.

export function isInterviewerFaceId(value: unknown): value is InterviewerFaceId {
  return (
    value === 'male-soft' ||
    value === 'male-neutral' ||
    value === 'male-strict' ||
    value === 'female-soft' ||
    value === 'female-neutral' ||
    value === 'female-strict'
  );
}

export function modeFromFaceId(faceId: InterviewerFaceId): InterviewerMode {
  if (faceId.endsWith('-soft')) return 'soft';
  if (faceId.endsWith('-strict')) return 'strict';
  return 'neutral';
}

export function genderFromFaceId(faceId: InterviewerFaceId): 'male' | 'female' {
  return faceId.startsWith('female') ? 'female' : 'male';
}

// Аватар-персона (фон/инициалы) выводится из тона — единый источник правды.
export function avatarFromMode(mode: InterviewerMode): InterviewerAvatarId {
  if (mode === 'soft') return 'warm-hr';
  if (mode === 'strict') return 'strict-lead';
  return 'neutral-pro';
}

// Дефолтное лицо для тона (пол по умолчанию — мужской). Используется, когда
// при создании интервью лицо явно не выбрано (его меняют уже в кабинете).
export function defaultFaceForMode(
  mode: InterviewerMode,
  gender: 'male' | 'female' = 'male'
): InterviewerFaceId {
  return `${gender}-${mode}` as InterviewerFaceId;
}
