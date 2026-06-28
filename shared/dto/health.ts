import { z } from 'zod';

export const HealthResponseDto = z.object({
  status: z.literal('ok'),
  service: z.string(),
  time: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseDto>;
