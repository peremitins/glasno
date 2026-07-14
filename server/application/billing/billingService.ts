import type {
  BillingCheckoutResponse,
  BillingPaymentHistoryResponse,
  BillingPaymentStatusResponse,
  BillingPlansResponse,
  BillingStatusResponse,
  UserRole,
} from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import type {
  BillingOwner,
  BillingRepository,
  FulfillPlanInput,
  PaidAccessRecord,
  PaymentOrderRecord,
} from '@/server/interface/billingRepository';
import { BillingAccessService } from './accessService';
import {
  findBillingPlan,
  getPaidBillingPlan,
  getPassPlans,
  getPublicBillingPlans,
  type BillingPlanConfig,
} from './plans';
import {
  buildYooKassaReceipt,
  createYooKassaPayment,
  createYooKassaPaymentMethodBinding,
  createYooKassaRecurringPayment,
  extractYooKassaPaymentEvent,
  getYooKassaConfirmationToken,
  getYooKassaPayment,
  getYooKassaPaymentMethod,
  type YooKassaConfig,
} from './yookassaClient';
import { GiftNotificationService } from './giftNotificationService';
import { sendGiftNotificationEmail } from './giftEmailSender';
import {
  sendRenewalFailedEmail,
  sendRenewalNoticeEmail,
} from './renewalEmailSender';
import type { TelegramAlertsService } from '@/server/application/telegram/telegramAlertsService';

// Политика ретраев автосписания (ТЗ тарифы v2, раздел 3): попытка в дату
// продления, повтор через 24 часа, максимум 3 попытки — затем автопродление
// выключается и пользователь получает письмо с CTA.
export const AUTO_RENEW_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
export const AUTO_RENEW_MAX_ATTEMPTS = 3;

// Предуведомление о списании: за 3 дня для пропусков от 30 дней, за 1 день
// для коротких. Горизонт выборки — максимальный из сроков.
const RENEWAL_NOTICE_LONG_LEAD_MS = 3 * 24 * 60 * 60 * 1000;
const RENEWAL_NOTICE_SHORT_LEAD_MS = 24 * 60 * 60 * 1000;
const RENEWAL_NOTICE_LONG_LEAD_MIN_DURATION_DAYS = 30;

export interface BillingServiceConfig {
  yookassa: YooKassaConfig;
  appUrl: string;
}

export class BillingService {
  private readonly access: BillingAccessService;
  private readonly giftNotifications: GiftNotificationService;

  constructor(
    private readonly deps: {
      repository: BillingRepository;
      config: BillingServiceConfig;
      telegramAlerts?: TelegramAlertsService;
    }
  ) {
    this.access = new BillingAccessService({
      repository: deps.repository,
    });
    this.giftNotifications = new GiftNotificationService({
      repository: deps.repository,
      sendEmail: sendGiftNotificationEmail,
      appUrl: deps.config.appUrl,
    });
  }

  getPlans(): BillingPlansResponse {
    return { plans: getPublicBillingPlans() };
  }

  async getStatus(owner: BillingOwner): Promise<BillingStatusResponse> {
    return this.access.getStatus(owner);
  }

  async claimGiftsForUser(params: {
    userId: string;
    email: string;
  }): Promise<number> {
    const claimed = await this.deps.repository.claimReadyGiftsByEmail({
      recipientEmail: params.email.trim().toLowerCase(),
      beneficiaryUserId: params.userId,
      plans: getPassPlans().map(toFulfillPlanInput),
    });
    return claimed.length;
  }

  async runGiftNotificationSweep(params?: { limit?: number; now?: Date }) {
    return await this.giftNotifications.runSweep(params);
  }

  async runPendingPaymentSweep(params?: { limit?: number }) {
    const orders = await this.deps.repository.listPendingPaymentOrders(params);
    const results = await Promise.allSettled(
      orders.map(async (order) => {
        if (!order.providerPaymentId) return;
        const verified = await getYooKassaPayment(
          this.deps.config.yookassa,
          order.providerPaymentId
        );
        await this.applyVerifiedYooKassaPayment(order, verified, 'pending-sweep');
      })
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      console.warn('[billing] pending payment sweep completed with errors', {
        checked: orders.length,
        failed,
      });
    }
    return {
      checked: orders.length,
      reconciled: orders.length - failed,
      failed,
    };
  }

  async getPaymentHistory(params: {
    userId: string | null | undefined;
    cursor?: string | null;
    limit?: number;
  }): Promise<BillingPaymentHistoryResponse> {
    if (!params.userId) {
      throw apiError('E_AUTH', 'Для просмотра платежей войдите в профиль');
    }
    const page = await this.deps.repository.listPaymentOrdersByUserId({
      userId: params.userId,
      cursor: params.cursor,
      limit: params.limit,
    });
    return {
      // Незавершённый checkout — ещё не покупка: пользователь мог закрыть
      // виджет или не подтвердить платёж. В историю попадают только финальные
      // результаты, чтобы не создавать ложное впечатление списания.
      items: page.items
        .filter(({ order }) => !isPendingPaymentStatus(order.status))
        .map(({ order, gift }) => {
          const plan = findBillingPlan(order.planId);
          return {
            id: order.id,
            planId: order.planId,
            planName: plan?.name ?? order.planId,
            planType: plan?.type ?? 'pass',
            amountRub: order.amountRub,
            currency: order.currency,
            status: order.status,
            createdAt: order.createdAt.toISOString(),
            gift: gift
              ? {
                  id: gift.id,
                  recipientEmailMasked: maskEmail(gift.recipientEmail),
                  status: effectiveGiftStatus(gift.status, gift.claimExpiresAt),
                  claimExpiresAt: gift.claimExpiresAt?.toISOString() ?? null,
                  claimedAt: gift.claimedAt?.toISOString() ?? null,
                  notificationStatus: gift.notificationStatus,
                }
              : null,
          };
        }),
      nextCursor: page.nextCursor,
    };
  }

  async createCheckout(params: {
    userId: string | null | undefined;
    role?: UserRole | null;
    planId: string;
    autoRenew?: boolean;
    gift?: { recipientEmail: string; senderName: string };
  }): Promise<BillingCheckoutResponse> {
    if (!params.userId) {
      throw apiError('E_AUTH', 'Для оплаты войдите в профиль');
    }
    this.requireYooKassaConfig();

    const plan = getPaidBillingPlan(params.planId);
    const recipientEmail = params.gift?.recipientEmail.trim().toLowerCase();
    const senderName = params.gift?.senderName?.trim();

    if (recipientEmail && !senderName) {
      throw apiError('E_VALIDATION', 'Укажите имя отправителя подарка');
    }

    if (recipientEmail && plan.type !== 'pass') {
      throw apiError(
        'E_VALIDATION',
        'Подарить можно только пропуск «Полный доступ»'
      );
    }

    const email = await this.deps.repository.findUserEmail(params.userId);
    if (recipientEmail && email?.trim().toLowerCase() === recipientEmail) {
      throw apiError('E_VALIDATION', 'Для себя выберите обычную покупку');
    }

    // Автопродление по умолчанию включено (ТЗ тарифы v2); для подарка —
    // всегда выключено, для пакетов минут не применимо.
    const autoRenew =
      !recipientEmail && plan.autoRenewable && (params.autoRenew ?? true);

    const order = recipientEmail
      ? (
          await this.deps.repository.createGiftPaymentOrder({
            purchaserUserId: params.userId,
            recipientEmail,
            senderName: senderName!,
            planId: plan.id,
            amountRub: plan.priceRub,
            currency: 'RUB',
            metadata: {
              userId: params.userId,
              planId: plan.id,
              gift: true,
            },
          })
        ).order
      : await this.deps.repository.createPaymentOrder({
          userId: params.userId,
          planId: plan.id,
          amountRub: plan.priceRub,
          currency: 'RUB',
          // autoRenew в metadata: выдача доступа идёт по вебхуку, который
          // не знает параметров исходного запроса.
          metadata: {
            userId: params.userId,
            planId: plan.id,
            autoRenew,
          },
        });

    // Чек 54-ФЗ: передаём receipt, если у пользователя указан email
    // (паттерн Mentala: без email платёж уходит без чека из кода).
    const description = recipientEmail
      ? `Гласно ${plan.name}, подарок`
      : `Гласно ${plan.name}`;

    // Куда виджет вернёт пользователя после оплаты. Для embedded это
    // передаётся не в теле платежа, а фронту — он отдаёт URL виджету.
    const returnUrl = buildYooKassaReturnUrl(this.deps.config.appUrl, order.id);

    try {
      const payment = await createYooKassaPayment({
        ...this.deps.config.yookassa,
        idempotenceKey: order.id,
        amountRub: plan.priceRub,
        description,
        metadata: {
          orderId: order.id,
          userId: params.userId,
          planId: plan.id,
          ...(recipientEmail ? { gift: 'true' } : {}),
        },
        receipt: email
          ? buildYooKassaReceipt({
              email,
              amountRub: plan.priceRub,
              description,
            })
          : undefined,
        // Автопродление: просим YooKassa сохранить карту. Плательщик видит
        // уведомление о сохранении на платёжной странице.
        savePaymentMethod: autoRenew,
      });
      const confirmationToken = getYooKassaConfirmationToken(payment);
      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        providerPaymentId: payment.id,
        status: payment.status || 'pending',
      });

      return {
        provider: 'yookassa',
        orderId: order.id,
        confirmationToken,
        returnUrl,
      };
    } catch (err) {
      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        status: 'failed',
      });
      if (recipientEmail) {
        await this.deps.repository.cancelGiftOrder({ orderId: order.id });
      }
      if (err && typeof err === 'object' && 'data' in err) {
        throw apiError('E_UPSTREAM', 'YooKassa отклонила создание платежа');
      }
      throw err;
    }
  }

  async handleYooKassaWebhook(payload: unknown): Promise<void> {
    const event = extractYooKassaPaymentEvent(payload);
    const order = event.orderId
      ? await this.deps.repository.findPaymentOrderById(event.orderId)
      : await this.deps.repository.findPaymentOrderByProviderPaymentId(
          event.providerPaymentId
        );
    if (!order) {
      // Неизвестный заказ: отвечаем 200, иначе YooKassa будет ретраить
      // вечно, а злоумышленник получит сигнал для перебора.
      console.warn('[billing] yookassa webhook: unknown order', {
        providerPaymentId: event.providerPaymentId,
        event: event.event,
      });
      return;
    }

    // КРИТИЧНО: телу вебхука доверять нельзя (его может подделать кто угодно).
    // Подтверждаем статус и сумму ОБРАТНЫМ запросом в YooKassa.
    this.requireYooKassaConfig();
    const verified = await getYooKassaPayment(
      this.deps.config.yookassa,
      event.providerPaymentId
    );
    await this.applyVerifiedYooKassaPayment(order, verified, event.event);
  }

  async reconcileYooKassaCheckout(params: {
    userId: string | null | undefined;
    orderId?: string | null;
  }): Promise<BillingPaymentStatusResponse> {
    if (!params.userId) {
      throw apiError('E_AUTH', 'Для проверки оплаты войдите в профиль');
    }

    const order = params.orderId
      ? await this.deps.repository.findPaymentOrderById(params.orderId)
      : await this.deps.repository.findLatestPaymentOrderByUserId(
          params.userId
        );

    if (!order) {
      return await this.buildCheckoutStatus({
        order: null,
        providerStatus: null,
        paid: false,
        providerVerified: false,
        shouldContinuePolling: false,
        userId: params.userId,
      });
    }

    if (order.userId !== params.userId) {
      throw apiError('E_NOT_FOUND', 'Платёжный заказ не найден');
    }

    if (!order.providerPaymentId) {
      return await this.buildCheckoutStatus({
        order,
        providerStatus: null,
        paid: false,
        providerVerified: false,
        shouldContinuePolling: isPendingPaymentStatus(order.status),
        userId: params.userId,
      });
    }

    this.requireYooKassaConfig();
    const verified = await getYooKassaPayment(
      this.deps.config.yookassa,
      order.providerPaymentId
    );

    return await this.applyVerifiedYooKassaPayment(
      order,
      verified,
      'checkout-status'
    );
  }

  // Явная привязка карты БЕЗ платежа (по образцу Mentala): создаём
  // payment_method в YooKassa, сохраняем pending-запись и отправляем
  // пользователя на страницу подтверждения банка.
  async startPaymentMethodBinding(
    userId: string | null | undefined
  ): Promise<{ confirmationUrl: string }> {
    if (!userId) {
      throw apiError('E_AUTH', 'Войдите в профиль');
    }
    this.requireYooKassaConfig();

    let binding: Awaited<
      ReturnType<typeof createYooKassaPaymentMethodBinding>
    >;
    try {
      binding = await createYooKassaPaymentMethodBinding({
        ...this.deps.config.yookassa,
        idempotenceKey: `bind-${userId}-${Date.now()}`,
        returnUrl: buildBindingReturnUrl(this.deps.config.appUrl),
      });
    } catch (err) {
      if (isYooKassaRecurringPaymentsUnavailable(err)) {
        throw apiError(
          'E_FORBIDDEN',
          'Автопродление ещё не подключено для магазина. Обратитесь в поддержку YooKassa.'
        );
      }
      throw apiError('E_UPSTREAM', 'Не удалось начать привязку карты в YooKassa');
    }
    const confirmationUrl = binding.confirmation?.confirmation_url;
    if (!binding.id || !confirmationUrl) {
      throw apiError(
        'E_UPSTREAM',
        'YooKassa не вернула ссылку для привязки карты. Проверьте, что для магазина включено сохранение платёжных методов.'
      );
    }

    await this.deps.repository.savePendingPaymentMethod({
      userId,
      providerPaymentMethodId: binding.id,
    });

    return { confirmationUrl };
  }

  // Синхронизация pending-привязки (вызывается опортунистически из
  // /api/billing/status, как syncPendingPaymentMethodBinding в Mentala).
  async syncPendingPaymentMethod(
    userId: string | null | undefined
  ): Promise<void> {
    if (!userId) return;
    const method = await this.deps.repository.findPaymentMethodByUserId(userId);
    if (!method || method.status !== 'pending') return;

    this.requireYooKassaConfig();
    const remote = await getYooKassaPaymentMethod(
      this.deps.config.yookassa,
      method.providerPaymentMethodId
    );

    if (remote.saved === true || remote.status === 'active') {
      await this.deps.repository.activatePaymentMethod({
        userId,
        providerPaymentMethodId: remote.id,
        methodType: remote.type ?? null,
        title: remote.title ?? null,
        cardBrand: remote.card?.card_type ?? null,
        cardLast4: remote.card?.last4 ?? null,
        cardExpiryMonth: remote.card?.expiry_month ?? null,
        cardExpiryYear: remote.card?.expiry_year ?? null,
      });
      // Карта появилась — включаем автопродление активного пропуска:
      // единственный вход в привязку без платежа — флоу «включить
      // автопродление без карты».
      const access = await this.deps.repository.findAccessByUserId(userId);
      if (isAccessActive(access)) {
        await this.deps.repository.setAccessAutoRenew({
          userId,
          autoRenew: true,
        });
      }
      return;
    }

    // Привязка отклонена/протухла — убираем pending-запись.
    if (remote.status === 'inactive' || remote.status === 'canceled') {
      await this.deps.repository.deletePaymentMethodByUserId(userId);
    }
  }

  // Отвязка карты = электронный отказ от сохранённых платёжных данных
  // (376-ФЗ): способ оплаты удаляется, автопродление выключается
  // безусловно. Текущий оплаченный период остаётся активным до конца.
  async unbindPaymentMethod(userId: string | null | undefined): Promise<void> {
    if (!userId) {
      throw apiError('E_AUTH', 'Войдите в профиль');
    }
    await this.deps.repository.deletePaymentMethodByUserId(userId);
    await this.deps.repository.setAccessAutoRenew({
      userId,
      autoRenew: false,
    });
  }

  async setAutoRenew(params: {
    userId: string | null | undefined;
    enabled: boolean;
  }): Promise<void> {
    if (!params.userId) {
      throw apiError('E_AUTH', 'Войдите в профиль');
    }
    if (params.enabled) {
      const method = await this.deps.repository.findPaymentMethodByUserId(
        params.userId
      );
      if (!method || method.status !== 'active') {
        throw apiError(
          'E_VALIDATION',
          'Сначала привяжите карту — автопродление списывает оплату с неё'
        );
      }
      const access = await this.deps.repository.findAccessByUserId(
        params.userId
      );
      if (!isAccessActive(access)) {
        throw apiError(
          'E_VALIDATION',
          'Автопродление доступно при активном пропуске «Полный доступ»'
        );
      }
    }
    await this.deps.repository.setAccessAutoRenew({
      userId: params.userId,
      autoRenew: params.enabled,
    });
  }

  // Автопродление при обращении пользователя к биллинг-статусу (по образцу
  // Mentala). Работает как бэкап к фоновому обходу runAutoRenewalSweep.
  // Безопасно вызывать часто: claim-паттерн не даст списать дважды.
  async maybeRunAutoRenewal(userId: string | null | undefined): Promise<void> {
    if (!userId) return;
    const now = new Date();
    const [due] = await this.deps.repository.listAccessDueForCharge({
      userId,
      now,
      retryAfterMs: AUTO_RENEW_RETRY_AFTER_MS,
      maxAttempts: AUTO_RENEW_MAX_ATTEMPTS,
      limit: 1,
    });
    if (!due) return;

    await this.chargeAccess(due, now);
  }

  // Фоновый обход доступов, которым пора автосписание (вызывается из
  // воркера/интервала). Ошибка по одному доступу не прерывает остальные.
  async runAutoRenewalSweep(params?: {
    limit?: number;
    now?: Date;
  }): Promise<{ processed: number; failed: number }> {
    const now = params?.now ?? new Date();
    const due = await this.deps.repository.listAccessDueForCharge({
      now,
      retryAfterMs: AUTO_RENEW_RETRY_AFTER_MS,
      maxAttempts: AUTO_RENEW_MAX_ATTEMPTS,
      limit: params?.limit ?? 50,
    });

    let processed = 0;
    let failed = 0;
    for (const access of due) {
      try {
        await this.chargeAccess(access, now);
        processed += 1;
      } catch (err) {
        failed += 1;
        console.error('[billing] renewal sweep item failed', {
          accessId: access.id,
          err,
        });
      }
    }
    if (processed > 0 || failed > 0) {
      console.info('[billing] renewal sweep done', { processed, failed });
    }
    return { processed, failed };
  }

  // Предуведомления о предстоящем автосписании (ТЗ тарифы v2, раздел 3):
  // за 1 день для коротких пропусков, за 3 дня для 30+. Идемпотентно:
  // claim через renewal_notice_sent_at — параллельные обходы письмо не
  // продублируют (at-most-once: потерянное письмо лучше двойного).
  async runRenewalNoticeSweep(params?: {
    limit?: number;
    now?: Date;
  }): Promise<{ sent: number; skipped: number }> {
    const now = params?.now ?? new Date();
    const candidates =
      await this.deps.repository.listAccessDueForRenewalNotice({
        now,
        horizonMs: RENEWAL_NOTICE_LONG_LEAD_MS,
        limit: params?.limit ?? 50,
      });

    let sent = 0;
    let skipped = 0;
    for (const access of candidates) {
      try {
        const plan = findBillingPlan(access.renewalPlanId ?? access.planId);
        if (!plan || !access.nextChargeAt) {
          skipped += 1;
          continue;
        }
        const leadMs =
          plan.durationDays >= RENEWAL_NOTICE_LONG_LEAD_MIN_DURATION_DAYS
            ? RENEWAL_NOTICE_LONG_LEAD_MS
            : RENEWAL_NOTICE_SHORT_LEAD_MS;
        if (access.nextChargeAt.getTime() - now.getTime() > leadMs) {
          // Для короткого пропуска ещё рано — попадёт в следующий обход.
          skipped += 1;
          continue;
        }
        const claimed = await this.deps.repository.claimRenewalNotice({
          accessId: access.id,
          now,
        });
        if (!claimed) {
          skipped += 1;
          continue;
        }
        const email = await this.deps.repository.findUserEmail(access.userId);
        if (!email) {
          // Почты нет — уведомить некуда, остаются экранные состояния.
          skipped += 1;
          continue;
        }
        await sendRenewalNoticeEmail({
          to: email,
          planName: plan.name,
          amountRub: access.renewalAmountRub ?? plan.priceRub,
          chargeAt: access.nextChargeAt,
          pricingUrl: buildPricingUrl(this.deps.config.appUrl),
        });
        sent += 1;
      } catch (err) {
        skipped += 1;
        console.error('[billing] renewal notice failed', {
          accessId: access.id,
          err,
        });
      }
    }
    if (sent > 0) {
      console.info('[billing] renewal notice sweep done', { sent, skipped });
    }
    return { sent, skipped };
  }

  private requireYooKassaConfig() {
    if (
      !this.deps.config.yookassa.shopId ||
      !this.deps.config.yookassa.secretKey
    ) {
      throw apiError('E_UPSTREAM', 'NUXT_YOOKASSA_* не заданы');
    }
  }

  // Одна попытка автосписания. Claim-паттерн гарантирует, что параллельные
  // вызовы (крон + опортунистический) не спишут дважды; счётчик попыток
  // инкрементируется атомарно в claim.
  private async chargeAccess(
    due: PaidAccessRecord,
    now: Date
  ): Promise<void> {
    const userId = due.userId;
    const claimed = await this.deps.repository.claimAccessForCharge({
      accessId: due.id,
      retryAfterMs: AUTO_RENEW_RETRY_AFTER_MS,
      maxAttempts: AUTO_RENEW_MAX_ATTEMPTS,
      now,
    });
    if (!claimed) return;

    const method = await this.deps.repository.findPaymentMethodByUserId(userId);
    if (!method || method.status !== 'active') {
      // Карты нет (гонка с отвязкой) — списывать нечем, продление выключаем.
      await this.deps.repository.setAccessAutoRenew({
        userId,
        autoRenew: false,
        now,
      });
      return;
    }

    const plan = findBillingPlan(claimed.renewalPlanId ?? claimed.planId);
    if (!plan) {
      await this.deps.repository.recordAccessChargeError({
        accessId: claimed.id,
        error: 'Тариф продления не найден',
        disableAutoRenew: true,
        now,
      });
      return;
    }

    this.requireYooKassaConfig();
    // Цена продления зафиксирована при покупке: изменение каталога уже
    // обещанное продление не удорожает.
    const amountRub = claimed.renewalAmountRub ?? plan.priceRub;
    const order = await this.deps.repository.createPaymentOrder({
      userId,
      planId: plan.id,
      amountRub,
      currency: 'RUB',
      metadata: {
        userId,
        planId: plan.id,
        renewal: true,
        autoRenew: true,
        accessId: claimed.id,
      },
    });

    try {
      const email = await this.deps.repository.findUserEmail(userId);
      const description = `Гласно ${plan.name} (автопродление)`;
      const payment = await createYooKassaRecurringPayment({
        ...this.deps.config.yookassa,
        idempotenceKey: order.id,
        amountRub,
        description,
        paymentMethodId: method.providerPaymentMethodId,
        metadata: {
          orderId: order.id,
          userId,
          planId: plan.id,
        },
        receipt: email
          ? buildYooKassaReceipt({
              email,
              amountRub,
              description,
            })
          : undefined,
      });

      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        providerPaymentId: payment.id,
        status: payment.status || 'pending',
      });

      // Верифицируем и выдаём продление тем же путём, что и обычные оплаты.
      const verified = await getYooKassaPayment(
        this.deps.config.yookassa,
        payment.id
      );
      await this.applyVerifiedYooKassaPayment(order, verified, 'auto-renewal');

      if (verified.status === 'canceled' || verified.status === 'failed') {
        await this.handleChargeFailure(
          claimed,
          plan,
          `Списание отклонено (${verified.status})`,
          now
        );
      }
    } catch (err) {
      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        status: 'failed',
      });
      await this.handleChargeFailure(
        claimed,
        plan,
        err instanceof Error ? err.message : 'Не удалось выполнить списание',
        now
      );
      console.error('[billing] auto-renewal charge failed', {
        userId,
        accessId: claimed.id,
        err,
      });
    }
  }

  // Неудачное списание: фиксируем ошибку; после финальной попытки выключаем
  // автопродление и шлём письмо с CTA «обновить карту и продлить».
  private async handleChargeFailure(
    claimed: PaidAccessRecord,
    plan: BillingPlanConfig,
    error: string,
    now: Date
  ): Promise<void> {
    // chargeAttempts в claimed — уже после инкремента этой попытки.
    const finalFailure = claimed.chargeAttempts >= AUTO_RENEW_MAX_ATTEMPTS;
    await this.deps.repository.recordAccessChargeError({
      accessId: claimed.id,
      error,
      disableAutoRenew: finalFailure,
      now,
    });
    if (!finalFailure) return;
    try {
      const email = await this.deps.repository.findUserEmail(claimed.userId);
      if (!email) return;
      await sendRenewalFailedEmail({
        to: email,
        planName: plan.name,
        amountRub: claimed.renewalAmountRub ?? plan.priceRub,
        pricingUrl: buildPricingUrl(this.deps.config.appUrl),
      });
    } catch (err) {
      console.error('[billing] renewal failure email failed', {
        accessId: claimed.id,
        err,
      });
    }
  }

  private async applyVerifiedYooKassaPayment(
    order: PaymentOrderRecord,
    verified: Awaited<ReturnType<typeof getYooKassaPayment>>,
    source: string
  ): Promise<BillingPaymentStatusResponse> {
    const plan = findBillingPlan(order.planId);
    const expectedAmount = order.amountRub.toFixed(2);
    const amountOk =
      verified.amountValue === expectedAmount && verified.currency === 'RUB';
    const paymentOk =
      verified.status === 'succeeded' && verified.paid && amountOk;

    await this.deps.repository.updatePaymentOrder({
      id: order.id,
      providerPaymentId: verified.id,
      status: verified.status,
      metadata: {
        ...(order.metadata || {}),
        paymentStatusSource: source,
        verifiedStatus: verified.status,
        verifiedAmount: verified.amountValue,
        verifiedCurrency: verified.currency,
        amountMatched: amountOk,
      },
    });

    const isGift = order.metadata?.gift === true;

    if (paymentOk && isGift) {
      const paidAt = new Date();
      await this.deps.repository.markGiftOrderPaid({
        orderId: order.id,
        providerPaymentId: verified.id,
        paidAt,
        claimExpiresAt: addMonthsTo(paidAt, 6),
      });
    } else if (paymentOk && plan) {
      // Идемпотентно: заказ блокируется в транзакции, повторный вызов
      // (вебхук + поллинг) доступ второй раз не выдаст.
      const savedMethod =
        verified.paymentMethod?.saved && verified.paymentMethod.id
          ? {
              providerPaymentMethodId: verified.paymentMethod.id,
              methodType: verified.paymentMethod.methodType,
              title: verified.paymentMethod.title,
              cardBrand: verified.paymentMethod.cardBrand,
              cardLast4: verified.paymentMethod.cardLast4,
              cardExpiryMonth: verified.paymentMethod.cardExpiryMonth,
              cardExpiryYear: verified.paymentMethod.cardExpiryYear,
            }
          : null;
      const fulfillResult = await this.deps.repository.fulfillPaidOrder({
        orderId: order.id,
        providerPaymentId: verified.id,
        plan: {
          ...toFulfillPlanInput(plan),
          // Цена продления фиксируется по фактически оплаченной сумме:
          // рекуррентные заказы наследуют цену первой покупки.
          priceRub: order.amountRub,
        },
        autoRenew: order.metadata?.autoRenew === true,
        paymentMethod: savedMethod,
      });
      // Только на реальную первую выдачу доступа — не на повторный вебхук/поллинг
      // уже выполненного заказа (fulfillPaidOrder идемпотентен).
      if (fulfillResult.fulfilled) {
        await this.notifyBillingPurchaseTelegram(order, plan);
      }
    } else if (paymentOk && !plan) {
      // Заказ на несуществующий тариф (данные из старой dev-схемы):
      // доступ не выдаём, оставляем след для разбора.
      console.error('[billing] paid order references unknown plan', {
        orderId: order.id,
        planId: order.planId,
      });
    } else if (
      isGift &&
      (verified.status === 'canceled' || verified.status === 'failed')
    ) {
      await this.deps.repository.cancelGiftOrder({
        orderId: order.id,
        now: new Date(),
      });
    }

    return await this.buildCheckoutStatus({
      order: {
        ...order,
        providerPaymentId: verified.id,
        status: verified.status,
      },
      providerStatus: verified.status,
      paid: verified.paid,
      providerVerified: true,
      shouldContinuePolling: isPendingPaymentStatus(verified.status),
      userId: order.userId,
    });
  }

  private async notifyBillingPurchaseTelegram(
    order: PaymentOrderRecord,
    plan: BillingPlanConfig
  ): Promise<void> {
    if (!this.deps.telegramAlerts) return;
    const email = await this.deps.repository.findUserEmail(order.userId);
    const user = {
      id: order.userId,
      email,
      telegramId: null,
      telegramUsername: null,
      displayName: null,
    };
    if (plan.type === 'minute_pack') {
      await this.deps.telegramAlerts.notifyVoiceMinutesPurchased({
        user,
        planName: plan.name,
        minutes: plan.realtimeVoiceMinutes,
        amountRub: order.amountRub,
      });
    } else {
      await this.deps.telegramAlerts.notifySubscriptionPurchased({
        user,
        planName: plan.name,
        amountRub: order.amountRub,
        isRenewal: order.metadata?.renewal === true,
      });
    }
  }

  private async buildCheckoutStatus(params: {
    order: PaymentOrderRecord | null;
    providerStatus: string | null;
    paid: boolean;
    providerVerified: boolean;
    shouldContinuePolling: boolean;
    userId: string;
  }): Promise<BillingPaymentStatusResponse> {
    const [access, gift] = await Promise.all([
      this.deps.repository.findAccessByUserId(params.userId),
      params.order
        ? this.deps.repository.findGiftEntitlementByOrderId(params.order.id)
        : Promise.resolve(null),
    ]);
    const active = isAccessActive(access);

    return {
      provider: 'yookassa',
      orderId: params.order?.id ?? null,
      localStatus: params.order?.status ?? 'none',
      providerPaymentId: params.order?.providerPaymentId ?? null,
      providerStatus: params.providerStatus,
      paid: params.paid,
      providerVerified: params.providerVerified,
      hasActivePaidAccess: active,
      accessExpiresAt: active
        ? access!.currentPeriodEnd.toISOString()
        : null,
      shouldContinuePolling: params.shouldContinuePolling,
      purchaseType: gift ? 'gift' : 'self',
      gift: gift
        ? {
            recipientEmailMasked: maskEmail(gift.recipientEmail),
            status: effectiveGiftStatus(gift.status, gift.claimExpiresAt),
            claimExpiresAt: gift.claimExpiresAt?.toISOString() ?? null,
            notificationStatus: gift.notificationStatus,
          }
        : null,
    };
  }
}

function toFulfillPlanInput(plan: BillingPlanConfig): FulfillPlanInput {
  return {
    id: plan.id,
    type: plan.type,
    durationDays: plan.durationDays,
    realtimeVoiceMinutes: plan.realtimeVoiceMinutes,
    priceRub: plan.priceRub,
  };
}

function isAccessActive(
  access: PaidAccessRecord | null,
  now = new Date()
): access is PaidAccessRecord {
  return Boolean(
    access && access.status === 'active' && access.currentPeriodEnd > now
  );
}

// YooKassa отвечает 403 Forbidden на POST /v3/payment_methods, когда для
// магазина ещё не подключены автоплатежи (сохранённые способы оплаты).
// Неверные ключи дали бы 401, поэтому 403 на этом эндпоинте однозначно
// означает «фича не включена». На точный текст description не опираемся —
// формулировки YooKassa меняются (recurring payments / saved methods / ...).
function isYooKassaRecurringPaymentsUnavailable(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { statusCode?: unknown }).statusCode === 403
  );
}

function isPendingPaymentStatus(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'waiting_for_capture';
}

function buildYooKassaReturnUrl(appUrl: string, orderId: string): string {
  const url = new URL('/pricing', `${appUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('payment', 'return');
  url.searchParams.set('orderId', orderId);
  return url.toString();
}

function buildBindingReturnUrl(appUrl: string): string {
  const url = new URL('/pricing', `${appUrl.replace(/\/$/, '')}/`);
  url.searchParams.set('binding', 'return');
  return url.toString();
}

function buildPricingUrl(appUrl: string): string {
  return new URL('/pricing', `${appUrl.replace(/\/$/, '')}/`).toString();
}

function addMonthsTo(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

function effectiveGiftStatus(
  status: 'pending_payment' | 'ready' | 'claimed' | 'canceled' | 'expired',
  claimExpiresAt: Date | null
) {
  if (status === 'ready' && claimExpiresAt && claimExpiresAt <= new Date()) {
    return 'expired' as const;
  }
  return status;
}
