import { z } from 'zod';

export const BillingPlanIntervalDto = z.enum(['once', 'month']);
// subscription — доступ на период (Pro, Career Pack);
// one_time — разовый доступ (Разовая подготовка: 1 интервью);
// addon — расходник (пакет минут realtime voice), требует активный тариф.
export const BillingPlanKindDto = z.enum(['subscription', 'one_time', 'addon']);

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

export const BillingSessionGoalAccessDto = z.enum(['quick', 'standard', 'deep']);

// Привязанная карта (презентация; PAN хранит YooKassa).
export const BillingPaymentMethodDto = z.object({
  title: z.string().nullable(),
  cardBrand: z.string().nullable(),
  cardLast4: z.string().nullable(),
  cardExpiryMonth: z.string().nullable(),
  cardExpiryYear: z.string().nullable(),
});

// Автопродление: когда и сколько спишется (по образцу Mentala).
export const BillingRenewalInfoDto = z.object({
  autoRenew: z.boolean(),
  nextChargeAt: z.string().nullable(),
  nextChargeAmountRub: z.number().int().nonnegative().nullable(),
  lastChargeError: z.string().nullable(),
  paymentMethod: BillingPaymentMethodDto.nullable(),
});

export const BillingStatusResponseDto = z.object({
  freeSessionsLimit: z.number().int().positive(),
  freeSessionsUsed: z.number().int().nonnegative(),
  canCreateInterview: z.boolean(),
  // Какие форматы интервью доступны сейчас (free — только 'quick').
  allowedSessionGoals: z.array(BillingSessionGoalAccessDto),
  // Остаток оплаченных интервью для разового тарифа (null = безлимит/не применимо).
  paidInterviewsRemaining: z.number().int().nonnegative().nullable().default(null),
  hasActiveSubscription: z.boolean(),
  // true для admin: безлимитное использование без тарифа.
  unlimited: z.boolean().default(false),
  activePlanId: z.string().nullable(),
  // Человекочитаемое имя активного тарифа для UI.
  activePlanName: z.string().nullable().default(null),
  subscriptionExpiresAt: z.string().nullable(),
  billing: BillingRenewalInfoDto.nullable().default(null),
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
  gift: z
    .object({
      recipientEmail: z.string().trim().toLowerCase().email().max(254),
      senderName: z.string().trim().min(1).max(80),
    })
    .optional(),
});

export const BillingCheckoutResponseDto = z.object({
  provider: z.literal('yookassa'),
  orderId: z.string(),
  confirmationUrl: z.string().url(),
});

export const BillingPaymentStatusResponseDto = z.object({
  provider: z.literal('yookassa'),
  orderId: z.string().nullable(),
  localStatus: z.string().nullable(),
  providerPaymentId: z.string().nullable(),
  providerStatus: z.string().nullable(),
  paid: z.boolean(),
  providerVerified: z.boolean(),
  hasActiveSubscription: z.boolean(),
  subscriptionExpiresAt: z.string().nullable(),
  shouldContinuePolling: z.boolean(),
  purchaseType: z.enum(['self', 'gift']).default('self'),
  gift: z
    .object({
      recipientEmailMasked: z.string(),
      status: z.enum([
        'pending_payment',
        'ready',
        'claimed',
        'canceled',
        'expired',
      ]),
      claimExpiresAt: z.string().nullable(),
      notificationStatus: z.enum(['pending', 'sending', 'sent', 'failed']),
    })
    .nullable()
    .default(null),
});

export const BillingPaymentHistoryGiftDto = z.object({
  id: z.string(),
  recipientEmailMasked: z.string(),
  status: z.enum([
    'pending_payment',
    'ready',
    'claimed',
    'canceled',
    'expired',
  ]),
  claimExpiresAt: z.string().nullable(),
  claimedAt: z.string().nullable(),
  notificationStatus: z.enum(['pending', 'sending', 'sent', 'failed']),
});

export const BillingPaymentHistoryItemDto = z.object({
  id: z.string(),
  planId: z.string(),
  planName: z.string(),
  planKind: BillingPlanKindDto,
  amountRub: z.number().int().nonnegative(),
  currency: z.literal('RUB'),
  provider: z.string(),
  status: z.string(),
  createdAt: z.string(),
  operationId: z.string().nullable(),
  gift: BillingPaymentHistoryGiftDto.nullable(),
});

export const BillingPaymentHistoryResponseDto = z.object({
  items: z.array(BillingPaymentHistoryItemDto),
  nextCursor: z.string().nullable(),
});

export const BillingWebhookResponseDto = z.object({
  ok: z.literal(true),
});

export const BillingAutoRenewRequestDto = z.object({
  enabled: z.boolean(),
});

export const BillingBindCardResponseDto = z.object({
  confirmationUrl: z.string().url(),
});

export const BillingSimpleResponseDto = z.object({
  ok: z.literal(true),
});

export type BillingPaymentMethod = z.infer<typeof BillingPaymentMethodDto>;
export type BillingRenewalInfo = z.infer<typeof BillingRenewalInfoDto>;
export type BillingAutoRenewRequest = z.infer<typeof BillingAutoRenewRequestDto>;
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
export type BillingPaymentStatusResponse = z.infer<
  typeof BillingPaymentStatusResponseDto
>;
export type BillingPaymentHistoryItem = z.infer<
  typeof BillingPaymentHistoryItemDto
>;
export type BillingPaymentHistoryResponse = z.infer<
  typeof BillingPaymentHistoryResponseDto
>;
