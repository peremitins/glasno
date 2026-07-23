import { z } from 'zod';

// pass — пропуск «Полный доступ» на срок (7–365 дней);
// minute_pack — разовый пакет минут realtime voice.
export const BillingPlanTypeDto = z.enum(['pass', 'minute_pack']);

export const BillingPlanDto = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priceRub: z.number().int().nonnegative(),
  currency: z.literal('RUB'),
  type: BillingPlanTypeDto,
  // Срок действия доступа (для пропуска) или потолок жизни минут (для пакета).
  durationDays: z.number().int().positive(),
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

// Сохранённый способ оплаты. PAN не хранится и не передаётся приложению.
export const BillingPaymentMethodDto = z.object({
  methodType: z.string().nullable(),
  title: z.string().nullable(),
  cardBrand: z.string().nullable(),
  cardLast4: z.string().nullable(),
  cardExpiryMonth: z.string().nullable(),
  cardExpiryYear: z.string().nullable(),
  // 'pending' — привязка начата или пригодность способа ещё не подтверждена
  // провайдером. Списывать с него нельзя, и UI обязан отличать это
  // состояние от «способа нет вовсе».
  status: z.enum(['active', 'pending']).default('active'),
});

// Автопродление: когда и сколько спишется. Сумма фиксируется в момент
// покупки (renewalAmountRub записи доступа), а не берётся из каталога.
export const BillingRenewalInfoDto = z.object({
  autoRenew: z.boolean(),
  nextChargeAt: z.string().nullable(),
  nextChargeAmountRub: z.number().int().nonnegative().nullable(),
  lastChargeError: z.string().nullable(),
  paymentMethod: BillingPaymentMethodDto.nullable(),
});

// Активный пропуск пользователя.
export const BillingActiveAccessDto = z.object({
  planId: z.string(),
  planName: z.string(),
  durationDays: z.number().int().positive(),
  expiresAt: z.string(),
});

export const BillingStatusResponseDto = z.object({
  freeSessionsLimit: z.number().int().positive(),
  freeSessionsUsed: z.number().int().nonnegative(),
  canCreateInterview: z.boolean(),
  // Незавершённая триал-сессия: попытка уже израсходована созданием,
  // но интервью можно продолжить (вместо пейволла показываем «продолжить»).
  trialResume: z
    .object({
      sessionId: z.string().uuid(),
      vacancyTitle: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable()
    .default(null),
  // Какие форматы интервью доступны сейчас (без пропуска — только 'quick').
  allowedSessionGoals: z.array(BillingSessionGoalAccessDto),
  // Есть активный оплаченный пропуск.
  hasActivePaidAccess: z.boolean(),
  // Автопродление включено, включая retry после окончания периода доступа.
  hasRecurringRenewal: z.boolean(),
  // true для admin: безлимитное использование без тарифа.
  unlimited: z.boolean().default(false),
  activeAccess: BillingActiveAccessDto.nullable().default(null),
  // Последний завершившийся пропуск — для состояния «доступ закончился».
  lastAccessEndedAt: z.string().nullable().default(null),
  lastAccessPlanName: z.string().nullable().default(null),
  billing: BillingRenewalInfoDto.nullable().default(null),
  needsAuthForCheckout: z.boolean(),
  realtimeVoice: z.object({
    includedMinutes: z.number().int().nonnegative(),
    usedMinutes: z.number().int().nonnegative(),
    remainingMinutes: z.number().int().nonnegative(),
    canBuyMore: z.boolean(),
  }),
});

// Куда возвращать пользователя после оплаты. Только внутренний путь
// приложения: начинается с одиночного '/', без '//', '\', query, фрагмента
// и двоеточия — чтобы returnUrl нельзя было увести на чужой origin.
export function isSafeBillingReturnPath(path: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9\-._~/]{0,199}$/.test(path);
}

export const BillingCheckoutRequestDto = z.object({
  planId: z.string().min(1),
  // Автопродление по умолчанию включено; пользователь может снять галочку
  // в чекауте. Для подарка сервер принудительно выключает.
  autoRenew: z.boolean().default(true),
  gift: z
    .object({
      recipientEmail: z.string().trim().toLowerCase().email().max(254),
      senderName: z.string().trim().min(1).max(80),
    })
    .optional(),
  // Внутренний путь возврата после оплаты (например, обратно в интервью
  // после покупки пакета минут). Невалидный или отсутствующий → /pricing.
  returnPath: z.string().refine(isSafeBillingReturnPath).optional(),
});

export const BillingCheckoutResponseDto = z.object({
  provider: z.literal('yookassa'),
  orderId: z.string(),
  // Токен для встроенного виджета YooKassa (confirmation.type = embedded).
  confirmationToken: z.string().min(1),
  // Куда виджет вернёт пользователя после успешной оплаты.
  returnUrl: z.string().url(),
});

// Клиентский сигнал «окно оплаты не открылось» (скрипт виджета не загрузился
// в браузере — типовая причина: VPN). Серверу иначе об этом не узнать.
export const BillingCheckoutIssueRequestDto = z.object({
  orderId: z.string().min(1).max(64).optional(),
});

export const BillingCheckoutIssueResponseDto = z.object({
  ok: z.literal(true),
});

export const BillingPaymentStatusResponseDto = z.object({
  provider: z.literal('yookassa'),
  orderId: z.string().nullable(),
  localStatus: z.string().nullable(),
  providerPaymentId: z.string().nullable(),
  providerStatus: z.string().nullable(),
  paid: z.boolean(),
  providerVerified: z.boolean(),
  hasActivePaidAccess: z.boolean(),
  accessExpiresAt: z.string().nullable(),
  shouldContinuePolling: z.boolean(),
  // Заполняется исключительно после серверной сверки YooKassa: клиенту не
  // нужно и нельзя выводить conversion из ответа самого платёжного виджета.
  conversion: z
    .object({
      planType: BillingPlanTypeDto,
      amountRub: z.number().int().positive(),
    })
    .nullable()
    .default(null),
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
  planType: BillingPlanTypeDto,
  amountRub: z.number().int().nonnegative(),
  currency: z.literal('RUB'),
  status: z.string(),
  createdAt: z.string(),
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

export const BillingBindPaymentMethodTypeDto = z.enum(['bank_card', 'sbp']);

export const BillingBindCardRequestDto = z.object({
  methodType: BillingBindPaymentMethodTypeDto.default('bank_card'),
});

export const BillingBindCardResponseDto = z.object({
  methodType: BillingBindPaymentMethodTypeDto,
  // Для карты — страница подтверждения банка, для СБП — ссылка НСПК
  // (на телефоне открывает выбор банка, на десктопе показывается QR-кодом).
  confirmationUrl: z.string().url(),
});

export const BillingSimpleResponseDto = z.object({
  ok: z.literal(true),
});

export type BillingPaymentMethod = z.infer<typeof BillingPaymentMethodDto>;
export type BillingRenewalInfo = z.infer<typeof BillingRenewalInfoDto>;
export type BillingActiveAccess = z.infer<typeof BillingActiveAccessDto>;
export type BillingAutoRenewRequest = z.infer<typeof BillingAutoRenewRequestDto>;
export type BillingPlanType = z.infer<typeof BillingPlanTypeDto>;
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
