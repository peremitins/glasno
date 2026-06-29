import { z } from 'zod';
import { AuthUserDto } from './auth';

export const SessionResponseDto = z.object({
  id: z.string(),
  isAnonymous: z.boolean(),
  user: AuthUserDto.nullable().optional(),
});

export type SessionResponse = z.infer<typeof SessionResponseDto>;
