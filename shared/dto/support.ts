import { z } from 'zod';

export const SupportMessageRequestDto = z.object({
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(5).max(4000),
});

export type SupportMessageRequest = z.infer<typeof SupportMessageRequestDto>;

export const SupportMessageResponseDto = z.object({
  ok: z.literal(true),
});

export type SupportMessageResponse = z.infer<typeof SupportMessageResponseDto>;
