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
  createdAt: Date;
  updatedAt: Date;
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

export interface BillingRepository {
  countOwnerSessions(owner: BillingOwner): Promise<number>;
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
  updatePaymentOrder(
    input: UpdatePaymentOrderInput
  ): Promise<PaymentOrderRecord | null>;
  grantSubscription(input: GrantSubscriptionInput): Promise<SubscriptionRecord>;
}
