import { z } from 'zod';
import { RealtimeSessionLimitsDto } from './interview';

export const TtsFormatDto = z.enum(['mp3', 'wav', 'opus']);

export const TtsRequestDto = z.object({
  text: z.string().trim().min(1).max(4000),
  voice: z.string().trim().min(1).max(64).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  format: TtsFormatDto.default('mp3'),
});

export const RealtimeSessionRequestDto = z.object({
  sessionId: z.string().min(1),
});

export const RealtimeSessionResponseDto = z.object({
  realtimeSessionId: z.string().min(1),
  clientSecret: z.string().min(1),
  expiresAt: z.number().nullable(),
  model: z.string().min(1),
  voice: z.string().min(1),
  maxDurationSeconds: z.number().int().nonnegative(),
  idleTimeoutSeconds: z.number().int().positive(),
  remainingSeconds: z.number().int().nonnegative(),
  realtimeLimits: RealtimeSessionLimitsDto,
});

export const RealtimeSessionEndReasonDto = z.enum([
  'user_stop',
  'idle_timeout',
  'hard_limit',
  'page_leave',
  'network_error',
  'provider_error',
]);

export const RealtimeSessionEndRequestDto = z.object({
  realtimeSessionId: z.string().min(1),
  reason: RealtimeSessionEndReasonDto.default('user_stop'),
});

export const RealtimeSessionActivityRequestDto = z.object({
  realtimeSessionId: z.string().min(1),
});

export const RealtimeSessionLifecycleResponseDto = z.object({
  ok: z.literal(true),
});

export type TtsFormat = z.infer<typeof TtsFormatDto>;
export type TtsRequest = z.infer<typeof TtsRequestDto>;
export type RealtimeSessionRequest = z.infer<
  typeof RealtimeSessionRequestDto
>;
export type RealtimeSessionResponse = z.infer<
  typeof RealtimeSessionResponseDto
>;
export type RealtimeSessionEndReason = z.infer<
  typeof RealtimeSessionEndReasonDto
>;
