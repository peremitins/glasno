export interface BillingOwner {
  anonymousSessionId: string;
  userId?: string | null;
  role?: 'user' | 'admin' | null;
}

export interface SubscriptionRecord {
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

export interface GrantSubscriptionInput {
  userId: string;
  planId: string;
  provider: 'yookassa';
  providerPaymentId: string;
  currentPeriodEnd: Date;
}

// Данные тарифа, нужные для выдачи доступа по оплаченному заказу.
export interface FulfillPlanInput {
  id: string;
  kind: 'subscription' | 'one_time' | 'addon';
  periodDays: number;
  realtimeVoiceMinutes: number;
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

export interface BillingRepository {
  countOwnerSessions(owner: BillingOwner): Promise<number>;
  countOwnerSessionsSince(owner: BillingOwner, since: Date): Promise<number>;
  findUserEmail(userId: string): Promise<string | null>;
  // Идемпотентная выдача доступа: подписка/разовый доступ + грант минут.
  // Безопасна при гонке «вебхук + поллинг checkout-status».
  // paymentMethod: сохранённая YooKassa карта — включает автопродление.
  fulfillPaidOrder(params: {
    orderId: string;
    providerPaymentId: string;
    plan: FulfillPlanInput;
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
  // Отвязка карты: удаляет способ оплаты и выключает автопродление.
  deletePaymentMethodByUserId(userId: string): Promise<void>;
  setSubscriptionAutoRenew(params: {
    userId: string;
    autoRenew: boolean;
    now?: Date;
  }): Promise<void>;
  // Атомарно «забирает» подписку на попытку автосписания (claim):
  // возвращает null, если списание уже выполняется/недавно было.
  claimSubscriptionForCharge(params: {
    subscriptionId: string;
    retryAfterMs: number;
    now?: Date;
  }): Promise<SubscriptionRecord | null>;
  recordSubscriptionChargeError(params: {
    subscriptionId: string;
    error: string;
    now?: Date;
  }): Promise<void>;
  getRealtimeMinuteBalance(
    userId: string,
    now?: Date
  ): Promise<RealtimeMinuteBalance>;
  // Списание секунд с активных грантов (FIFO по сроку истечения).
  debitRealtimeSeconds(params: {
    userId: string;
    seconds: number;
    realtimeSessionId?: string | null;
    now?: Date;
  }): Promise<void>;
  findActiveSubscriptionByUserId(
    userId: string,
    now?: Date
  ): Promise<SubscriptionRecord | null>;
  findActiveSubscriptionsByUserId(
    userId: string,
    now?: Date
  ): Promise<SubscriptionRecord[]>;
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
  findSubscriptionByProviderPaymentId(
    providerPaymentId: string
  ): Promise<SubscriptionRecord | null>;
  grantSubscription(input: GrantSubscriptionInput): Promise<SubscriptionRecord>;
}
