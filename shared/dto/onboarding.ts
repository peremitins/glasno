import { z } from 'zod';
import { AuthUserOnboardingDto } from './auth';

export const OnboardingCompleteResponseDto = z.object({
  ok: z.literal(true),
  onboarding: AuthUserOnboardingDto,
});

export type OnboardingCompleteResponse = z.infer<
  typeof OnboardingCompleteResponseDto
>;
