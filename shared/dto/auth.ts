import { z } from 'zod';

export const UserRoleDto = z.enum(['user', 'admin']);

export const AuthUserOnboardingDto = z
  .object({
    interviewExplainSelection: z.boolean().default(false),
  })
  .default({
    interviewExplainSelection: false,
  });

export const AuthUserDto = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  telegramId: z.string().nullable(),
  telegramUsername: z.string().nullable(),
  displayName: z.string().nullable(),
  role: UserRoleDto,
  onboarding: AuthUserOnboardingDto,
  emailVerifiedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const AuthMeResponseDto = z.object({
  isAuthenticated: z.boolean(),
  user: AuthUserDto.nullable(),
});

export const EmailLoginStartRequestDto = z.object({
  email: z.string().trim().email().max(320),
});

export const EmailLoginStartResponseDto = z.object({
  ok: z.literal(true),
  expiresAt: z.string(),
  devCode: z.string().optional(),
});

export const EmailLoginVerifyRequestDto = z.object({
  email: z.string().trim().email().max(320),
  code: z.string().trim().regex(/^\d{6}$/),
});

export const AuthLoginResponseDto = z.object({
  ok: z.literal(true),
  user: AuthUserDto,
});

export const TelegramLoginRequestDto = z.object({
  id: z.union([z.string(), z.number()]),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().url().optional(),
  auth_date: z.union([z.string(), z.number()]),
  hash: z.string().min(1),
});

export const MagicLoginConsumeQueryDto = z.object({
  token: z.string().min(24).max(512),
});

export const LogoutResponseDto = z.object({
  ok: z.literal(true),
});

export const DeleteAccountResponseDto = z.object({
  ok: z.literal(true),
});

export type UserRole = z.infer<typeof UserRoleDto>;
export type AuthUserOnboarding = z.infer<typeof AuthUserOnboardingDto>;
export type AuthUser = z.infer<typeof AuthUserDto>;
export type AuthMeResponse = z.infer<typeof AuthMeResponseDto>;
export type EmailLoginStartRequest = z.infer<
  typeof EmailLoginStartRequestDto
>;
export type EmailLoginStartResponse = z.infer<
  typeof EmailLoginStartResponseDto
>;
export type EmailLoginVerifyRequest = z.infer<
  typeof EmailLoginVerifyRequestDto
>;
export type AuthLoginResponse = z.infer<typeof AuthLoginResponseDto>;
export type TelegramLoginRequest = z.infer<typeof TelegramLoginRequestDto>;
export type MagicLoginConsumeQuery = z.infer<typeof MagicLoginConsumeQueryDto>;
export type LogoutResponse = z.infer<typeof LogoutResponseDto>;
export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponseDto>;
