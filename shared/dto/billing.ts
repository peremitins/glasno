import { z } from 'zod';

export const BillingPlanIntervalDto = z.enum(['once', 'month']);
export const BillingPlanKindDto = z.enum(['subscription', 'addon']);

export const BillingPlanDto = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priceRub: z.number().int().nonnegative(),
  currency: z.literal('RUB'),
  interval: BillingPlanIntervalDto,
  kind: BillingPlanKindDto.default('subscription'),
  realtimeVoiceMinutes: z.number().int().nonnegative().default(0),
  features: z.array(z.string()),
  badge: z.string().nullable(),
  isHighlighted: z.boolean(),
  isCheckoutEnabled: z.boolean(),
});

export const BillingPlansResponseDto = z.object({
  plans: z.array(BillingPlanDto),
});

export const BillingStatusResponseDto = z.object({
  freeSessionsLimit: z.number().int().positive(),
  freeSessionsUsed: z.number().int().nonnegative(),
  canCreateInterview: z.boolean(),
  hasActiveSubscription: z.boolean(),
  // true для admin: безлимитное использование без тарифа.
  unlimited: z.boolean().default(false),
  activePlanId: z.string().nullable(),
  subscriptionExpiresAt: z.string().nullable(),
  needsAuthForCheckout: z.boolean(),
  realtimeVoice: z.object({
    includedMinutes: z.number().int().nonnegative(),
    usedMinutes: z.number().int().nonnegative(),
    remainingMinutes: z.number().int().nonnegative(),
    canBuyMore: z.boolean(),
  }),
});

export const BillingCheckoutRequestDto = z.object({
  planId: z.string().min(1),
});

export const BillingCheckoutResponseDto = z.object({
  provider: z.literal('yookassa'),
  orderId: z.string(),
  confirmationUrl: z.string().url(),
});

export const BillingWebhookResponseDto = z.object({
  ok: z.literal(true),
});

export type BillingPlanInterval = z.infer<typeof BillingPlanIntervalDto>;
export type BillingPlanKind = z.infer<typeof BillingPlanKindDto>;
export type BillingPlan = z.infer<typeof BillingPlanDto>;
export type BillingPlansResponse = z.infer<typeof BillingPlansResponseDto>;
export type BillingStatusResponse = z.infer<typeof BillingStatusResponseDto>;
export type BillingCheckoutRequest = z.infer<
  typeof BillingCheckoutRequestDto
>;
export type BillingCheckoutResponse = z.infer<
  typeof BillingCheckoutResponseDto
>;
