export interface BillingOwner {
  anonymousSessionId: string;
  userId?: string | null;
  role?: 'user' | 'admin' | null;
}

// Запись оплаченного доступа («Полный доступ» на срок). Одна на
// пользователя: продление обновляет её, а не создаёт новую.
export interface PaidAccessRecord {
  id: string;
  userId: string;
  planId: string;
  status: string;
  provider: string;
  providerPaymentId: string | null;
  currentPeriodEnd: Date;
  autoRenew: boolean;
  nextChargeAt: Date | null;
  lastChargeAttemptAt: Date | null;
  lastChargeError: string | null;
  chargeAttempts: number;
  // Условия продления, зафиксированные при покупке.
  renewalPlanId: string | null;
  renewalAmountRub: number | null;
  renewalNoticeSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Сохранённый способ оплаты (карта YooKassa) для автосписаний.
// status: 'pending' — привязка начата, ждём подтверждения; 'active' — готова.
export interface PaymentMethodRecord {
  id: string;
  userId: string;
  provider: string;
  providerPaymentMethodId: string;
  status: string;
  methodType: string | null;
  title: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpiryMonth: string | null;
  cardExpiryYear: string | null;
  createdAt: Date;
}

export interface SavePaymentMethodInput {
  userId: string;
  providerPaymentMethodId: string;
  methodType?: string | null;
  title?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  cardExpiryMonth?: string | null;
  cardExpiryYear?: string | null;
}

export interface PaymentOrderRecord {
  id: string;
  userId: string;
  planId: string;
  provider: string;
  providerPaymentId: string | null;
  status: string;
  amountRub: number;
  currency: 'RUB';
  confirmationUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export type GiftEntitlementStatus =
  | 'pending_payment'
  | 'ready'
  | 'claimed'
  | 'canceled'
  | 'expired';

export type GiftNotificationStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed';

export interface GiftEntitlementRecord {
  id: string;
  orderId: string;
  purchaserUserId: string;
  recipientEmail: string;
  senderName: string | null;
  planId: string;
  status: GiftEntitlementStatus;
  paidAt: Date | null;
  claimExpiresAt: Date | null;
  claimedAt: Date | null;
  claimedByUserId: string | null;
  notificationStatus: GiftNotificationStatus;
  notificationAttempts: number;
  notificationNextAttemptAt: Date | null;
  notificationSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GiftPaymentOrderResult {
  order: PaymentOrderRecord;
  gift: GiftEntitlementRecord;
}

export interface PaymentOrderHistoryPage {
  items: Array<{
    order: PaymentOrderRecord;
    gift: GiftEntitlementRecord | null;
  }>;
  nextCursor: string | null;
}

export interface CreatePaymentOrderInput {
  userId: string;
  planId: string;
  amountRub: number;
  currency: 'RUB';
  metadata: Record<string, unknown>;
}

export interface UpdatePaymentOrderInput {
  id: string;
  providerPaymentId?: string | null;
  status?: string;
  confirmationUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

// Данные тарифа, нужные для выдачи доступа по оплаченному заказу.
export interface FulfillPlanInput {
  id: string;
  type: 'pass' | 'minute_pack';
  durationDays: number;
  realtimeVoiceMinutes: number;
  // Цена покупки: фиксируется как renewal_amount_rub записи доступа.
  priceRub: number;
}

export interface FulfillPaidOrderResult {
  fulfilled: boolean;
  alreadyFulfilled: boolean;
}

// Баланс минут realtime voice по активным (неистёкшим) грантам.
export interface RealtimeMinuteBalance {
  totalSeconds: number;
  consumedSeconds: number;
  remainingSeconds: number;
}

// Незавершённая сессия владельца — предлагается к продолжению в триале
// вместо создания новой.
export interface UnfinishedSessionRecord {
  id: string;
  vacancyTitle: string | null;
  createdAt: Date;
}

export interface BillingRepository {
  countOwnerSessions(owner: BillingOwner): Promise<number>;
  // Использованные бесплатные интервью: все созданные сессии владельца
  // (попытка расходуется при создании, не при отчёте) плюс неизменяемая
  // история попыток для email/Telegram ID.
  countOwnerFreeSessionsUsed(owner: BillingOwner): Promise<number>;
  // Самая свежая незавершённая сессия владельца (status created|running,
  // без готового отчёта) — для «продолжить интервью» в триале.
  findOwnerUnfinishedSession(
    owner: BillingOwner
  ): Promise<UnfinishedSessionRecord | null>;
  // Для антиабьюз-порогов: сколько сессий создано с указанного момента.
  countOwnerSessionsSince(owner: BillingOwner, since: Date): Promise<number>;
  findUserEmail(userId: string): Promise<string | null>;
  // Идемпотентная выдача доступа: пропуск (создание/продление записи) или
  // пакет минут. Безопасна при гонке «вебхук + поллинг checkout-status».
  // autoRenew — выбор пользователя в чекауте; фактически включается, только
  // если есть сохранённая карта (пришла с платежом или привязана ранее).
  fulfillPaidOrder(params: {
    orderId: string;
    providerPaymentId: string;
    plan: FulfillPlanInput;
    autoRenew: boolean;
    paymentMethod?: {
      providerPaymentMethodId: string;
      methodType?: string | null;
      title?: string | null;
      cardBrand?: string | null;
      cardLast4?: string | null;
      cardExpiryMonth?: string | null;
      cardExpiryYear?: string | null;
    } | null;
    now?: Date;
  }): Promise<FulfillPaidOrderResult>;
  findPaymentMethodByUserId(userId: string): Promise<PaymentMethodRecord | null>;
  // Начало явной привязки карты: сохраняем pending-запись (upsert).
  savePendingPaymentMethod(params: {
    userId: string;
    providerPaymentMethodId: string;
  }): Promise<void>;
  // Подтверждение привязки: presentation карты + статус active.
  activatePaymentMethod(params: {
    userId: string;
    providerPaymentMethodId: string;
    methodType?: string | null;
    title?: string | null;
    cardBrand?: string | null;
    cardLast4?: string | null;
    cardExpiryMonth?: string | null;
    cardExpiryYear?: string | null;
  }): Promise<void>;
  // Отвязка карты = электронный отказ (376-ФЗ): способ оплаты удаляется,
  // автопродление выключает application-слой.
  deletePaymentMethodByUserId(userId: string): Promise<void>;
  // Запись доступа пользователя (включая истёкшую) — одна на пользователя.
  findAccessByUserId(userId: string): Promise<PaidAccessRecord | null>;
  // Включение/выключение автопродления активного доступа. При включении
  // сбрасывает счётчик попыток и ошибку последнего списания.
  setAccessAutoRenew(params: {
    userId: string;
    autoRenew: boolean;
    now?: Date;
  }): Promise<void>;
  // Доступы, которым пора автосписание: active, autoRenew, nextChargeAt <=
  // now, попыток меньше maxAttempts, с учётом троттлинга повторов.
  listAccessDueForCharge(params: {
    userId?: string;
    now?: Date;
    retryAfterMs: number;
    maxAttempts: number;
    limit?: number;
  }): Promise<PaidAccessRecord[]>;
  // Атомарно «забирает» запись на попытку списания и инкрементирует
  // charge_attempts. null — уже в работе/недавно была попытка.
  claimAccessForCharge(params: {
    accessId: string;
    retryAfterMs: number;
    maxAttempts: number;
    now?: Date;
  }): Promise<PaidAccessRecord | null>;
  recordAccessChargeError(params: {
    accessId: string;
    error: string;
    // Финальная неудача: автопродление выключается.
    disableAutoRenew?: boolean;
    now?: Date;
  }): Promise<void>;
  // Кандидаты на предуведомление о списании: autoRenew, списание в пределах
  // горизонта, уведомление ещё не отправлялось.
  listAccessDueForRenewalNotice(params: {
    now?: Date;
    horizonMs: number;
    limit?: number;
  }): Promise<PaidAccessRecord[]>;
  // Идемпотентный claim отправки предуведомления (одно на период):
  // true — можно отправлять, false — уже отправлено/забрано параллельно.
  claimRenewalNotice(params: {
    accessId: string;
    now?: Date;
  }): Promise<boolean>;
  getRealtimeMinuteBalance(
    userId: string,
    now?: Date
  ): Promise<RealtimeMinuteBalance>;
  // Идемпотентная выдача бесплатных триал-минут голоса: один грант на
  // пользователя (guard по sourceType='trial'). Повторный вызов — no-op.
  // Дополнительно блокирует повторную выдачу тому же email/telegram_id,
  // если аккаунт был удалён и создан заново (см. trial_grant_history).
  ensureTrialRealtimeGrant(params: {
    userId: string;
    totalSeconds: number;
    planId: string;
    expiresAt: Date;
  }): Promise<void>;
  // Списание секунд с активных грантов (FIFO по сроку истечения).
  debitRealtimeSeconds(params: {
    userId: string;
    seconds: number;
    realtimeSessionId?: string | null;
    now?: Date;
  }): Promise<void>;
  countRealtimeVoiceUsageSeconds(
    owner: BillingOwner,
    params: {
      windowStart: Date;
      windowEnd: Date;
      idleTimeoutMs: number;
      now?: Date;
    }
  ): Promise<number>;
  createPaymentOrder(input: CreatePaymentOrderInput): Promise<PaymentOrderRecord>;
  createGiftPaymentOrder(input: {
    purchaserUserId: string;
    recipientEmail: string;
    senderName: string;
    planId: string;
    amountRub: number;
    currency: 'RUB';
    metadata: Record<string, unknown>;
  }): Promise<GiftPaymentOrderResult>;
  findGiftEntitlementByOrderId(
    orderId: string
  ): Promise<GiftEntitlementRecord | null>;
  markGiftOrderPaid(params: {
    orderId: string;
    providerPaymentId: string;
    paidAt?: Date;
    claimExpiresAt: Date;
  }): Promise<GiftEntitlementRecord | null>;
  cancelGiftOrder(params: {
    orderId: string;
    now?: Date;
  }): Promise<void>;
  claimReadyGiftsByEmail(params: {
    recipientEmail: string;
    beneficiaryUserId: string;
    plans: FulfillPlanInput[];
    now?: Date;
  }): Promise<GiftEntitlementRecord[]>;
  listPaymentOrdersByUserId(params: {
    userId: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<PaymentOrderHistoryPage>;
  // Незавершённые платежи с созданным идентификатором провайдера: их нужно
  // периодически сверять, если пользователь не дождался возврата из виджета.
  listPendingPaymentOrders(params?: {
    limit?: number;
  }): Promise<PaymentOrderRecord[]>;
  claimGiftNotifications(params: {
    now?: Date;
    limit?: number;
  }): Promise<GiftEntitlementRecord[]>;
  markGiftNotificationSent(params: {
    giftId: string;
    now?: Date;
  }): Promise<void>;
  markGiftNotificationFailed(params: {
    giftId: string;
    nextAttemptAt: Date | null;
    now?: Date;
  }): Promise<void>;
  findPaymentOrderById(id: string): Promise<PaymentOrderRecord | null>;
  findPaymentOrderByProviderPaymentId(
    providerPaymentId: string
  ): Promise<PaymentOrderRecord | null>;
  findLatestPaymentOrderByUserId(
    userId: string
  ): Promise<PaymentOrderRecord | null>;
  updatePaymentOrder(
    input: UpdatePaymentOrderInput
  ): Promise<PaymentOrderRecord | null>;
}
