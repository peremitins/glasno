import type {
  BillingCheckoutResponse,
  BillingPaymentHistoryResponse,
  BillingPaymentStatusResponse,
  BillingPlanType,
  BillingPlansResponse,
  BillingStatusResponse,
  UserRole,
} from '@/shared/dto';
import { isSafeBillingReturnPath } from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import type {
  BillingOwner,
  BillingRepository,
  FulfillPlanInput,
  PaidAccessRecord,
  PaymentOrderRecord,
} from '@/server/interface/billingRepository';
import {
  PassCheckoutInProgressError,
  RenewalAccessChangedError,
  RenewalPaymentQuarantinedError,
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
  classifyYooKassaRecurringPaymentError,
  createYooKassaPayment,
  createYooKassaPaymentMethodBinding,
  createYooKassaRecurringPayment,
  extractYooKassaApiError,
  extractYooKassaPaymentEvent,
  formatYooKassaApiError,
  getYooKassaConfirmationToken,
  getYooKassaPayment,
  isYooKassaNotFound,
  listYooKassaPayments,
  getYooKassaPaymentMethod,
  type YooKassaConfig,
  type YooKassaBindablePaymentMethodType,
} from './yookassaClient';
import { GiftNotificationService } from './giftNotificationService';
import { sendGiftNotificationEmail } from './giftEmailSender';
import {
  sendRenewalChargedEmail,
  sendRenewalFailedEmail,
  sendRenewalManualReviewEmail,
  sendRenewalNoticeEmail,
} from './renewalEmailSender';
import type { TelegramAlertsService } from '@/server/application/telegram/telegramAlertsService';
import { resolveBillingAppUrl } from './appUrl';

// Политика ретраев автосписания (ТЗ тарифы v2, раздел 3): попытка в дату
// продления, повтор через 24 часа, максимум 3 попытки — затем автопродление
// выключается и пользователь получает письмо с CTA.
export const AUTO_RENEW_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
export const AUTO_RENEW_MAX_ATTEMPTS = 3;
// Sweep запускается раз в час, поэтому более короткая задержка создаёт ложное
// обещание времени повтора и всё равно не исполняется раньше следующего тика.
const AUTO_RENEW_INDETERMINATE_RETRY_AFTER_MS = 60 * 60 * 1000;
// Ограничение частоты YooKassa — не отказ оплаты. Даём провайдеру паузу и
// повторяем тот же запрос, не расходуя одну из трёх попыток пользователя.
const AUTO_RENEW_TRANSIENT_RETRY_AFTER_MS = 15 * 60 * 1000;
const PAYMENT_RECONCILIATION_LEASE_MS = 5 * 60 * 1000;
// YooKassa гарантирует идемпотентность ключа 24 часа. Оставляем часовой запас:
// после этого срока повтор POST с прежним ключом уже может дать второе списание.
const YOOKASSA_IDEMPOTENCE_SAFE_WINDOW_MS = 23 * 60 * 60 * 1000;
// Карантин — не приговор: заказ без providerPaymentId перепроверяется поиском
// платежа по metadata.orderId в списке платежей YooKassa.
const RENEWAL_QUARANTINE_RECHECK_AFTER_MS = 15 * 60 * 1000;
// Запас на расхождение часов между нашим сервером и YooKassa при фильтрации
// списка платежей по дате создания.
const PROVIDERLESS_PAYMENT_SEARCH_SKEW_MS = 15 * 60 * 1000;
// Вердикт «платежа не существует» выносим только отлежавшемуся заказу:
// свежесозданный платёж мог ещё не попасть в выдачу списка.
const PROVIDERLESS_PAYMENT_ABSENCE_MIN_AGE_MS = 30 * 60 * 1000;
const PROVIDERLESS_PAYMENT_SEARCH_MAX_PAGES = 25;
// Сколько ждём, пока способ оплаты «дозреет» у провайдера. У карты объект
// может появиться с задержкой; фантомный id из платежа по СБП не появится
// никогда — после этого окна pending-запись удаляется как мусор.
const PENDING_PAYMENT_METHOD_GRACE_MS = 24 * 60 * 60 * 1000;

const PERMANENT_PAYMENT_METHOD_CANCELLATION_REASONS = new Set([
  'card_expired',
  'payment_method_restricted',
  'permission_revoked',
]);

const DAY_MS = 24 * 60 * 60 * 1000;

interface RenewalRequestSnapshot {
  amountRub: number;
  description: string;
  paymentMethodId: string;
  planId: string;
  receiptEmail: string | null;
}

function readRenewalRequestSnapshot(
  metadata: Record<string, unknown> | null
): RenewalRequestSnapshot | null {
  const value = metadata?.renewalRequest;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const snapshot = value as Record<string, unknown>;
  const receiptEmail = snapshot.receiptEmail;
  if (
    typeof snapshot.amountRub !== 'number' ||
    !Number.isFinite(snapshot.amountRub) ||
    snapshot.amountRub <= 0 ||
    typeof snapshot.description !== 'string' ||
    snapshot.description.length === 0 ||
    typeof snapshot.paymentMethodId !== 'string' ||
    snapshot.paymentMethodId.length === 0 ||
    typeof snapshot.planId !== 'string' ||
    snapshot.planId.length === 0 ||
    (receiptEmail !== null && typeof receiptEmail !== 'string')
  ) {
    return null;
  }

  return {
    amountRub: snapshot.amountRub,
    description: snapshot.description,
    paymentMethodId: snapshot.paymentMethodId,
    planId: snapshot.planId,
    receiptEmail,
  };
}

function readRenewalAttemptNumber(
  metadata: Record<string, unknown> | null
): number | null {
  const value = metadata?.renewalAttemptNumber;
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function readRenewalAccessProviderPaymentId(
  metadata: Record<string, unknown> | null
): string | null | undefined {
  const value = metadata?.renewalAccessProviderPaymentId;
  if (value === null) return null;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRenewalMetadataString(
  metadata: Record<string, unknown> | null,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getExpectedRenewalAccess(
  access: PaidAccessRecord | null,
  metadata: Record<string, unknown> | null
): PaidAccessRecord | null {
  if (!access) return null;
  const expectedProviderPaymentId =
    readRenewalAccessProviderPaymentId(metadata);
  if (
    expectedProviderPaymentId === undefined ||
    access.providerPaymentId !== expectedProviderPaymentId
  ) {
    return null;
  }
  return { ...access, providerPaymentId: expectedProviderPaymentId };
}

async function retryIndeterminateYooKassaRequest<T>(
  request: () => Promise<T>
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const errorInfo = extractYooKassaApiError(error);
    if (classifyYooKassaRecurringPaymentError(errorInfo) !== 'indeterminate') {
      throw error;
    }
    return await request();
  }
}

// Политика предуведомлений о списании. Коротким пропускам (7–15 дней) письмо
// не шлём: покупка ещё свежа в памяти, напоминание читается как спам и как
// приглашение отписаться. Чем длиннее пропуск — тем выше шанс, что о сервисе
// забыли, поэтому предупреждаем заранее. Подтверждение состоявшегося списания
// (sendRenewalChargedEmail) уходит всем и от срока не зависит.
const RENEWAL_NOTICE_LEAD_RULES: { minDurationDays: number; leadMs: number }[] =
  [
    { minDurationDays: 90, leadMs: 7 * DAY_MS },
    { minDurationDays: 30, leadMs: 3 * DAY_MS },
  ];
// Горизонт выборки кандидатов — максимальный из lead-сроков.
const RENEWAL_NOTICE_MAX_LEAD_MS = Math.max(
  ...RENEWAL_NOTICE_LEAD_RULES.map((rule) => rule.leadMs)
);

// null — предуведомление для этого срока не отправляем вовсе.
export function resolveRenewalNoticeLeadMs(durationDays: number): number | null {
  const rule = RENEWAL_NOTICE_LEAD_RULES.find(
    (candidate) => durationDays >= candidate.minDurationDays
  );
  return rule?.leadMs ?? null;
}

export interface BillingServiceConfig {
  yookassa: YooKassaConfig;
  appUrl: string;
}

export class BillingService {
  private readonly access: BillingAccessService;
  private readonly giftNotifications: GiftNotificationService;
  private readonly appUrl: string;

  constructor(
    private readonly deps: {
      repository: BillingRepository;
      config: BillingServiceConfig;
      telegramAlerts?: TelegramAlertsService;
    }
  ) {
    this.appUrl = resolveBillingAppUrl(deps.config.appUrl);
    this.access = new BillingAccessService({
      repository: deps.repository,
    });
    this.giftNotifications = new GiftNotificationService({
      repository: deps.repository,
      sendEmail: sendGiftNotificationEmail,
      appUrl: this.appUrl,
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

  async runPendingPaymentSweep(params?: {
    limit?: number;
    allowRenewalCreate?: boolean;
  }) {
    const orders = await this.deps.repository.listPendingPaymentOrders({
      limit: params?.limit,
    });
    const results = await Promise.allSettled(
      orders.map(async (order) => {
        const now = new Date();
        const claimed =
          await this.deps.repository.claimPaymentOrderReconciliation({
            orderId: order.id,
            now,
            leaseUntil: new Date(
              now.getTime() + PAYMENT_RECONCILIATION_LEASE_MS
            ),
          });
        if (!claimed) return false;
        await this.reconcilePendingPaymentOrder(order, now, {
          allowRenewalCreate: params?.allowRenewalCreate !== false,
        });
        return true;
      })
    );
    // Причина каждого падения обязана попадать в логи: молчаливый счётчик
    // failed уже дважды прятал прод-инциденты (см. 42P18 в claim 22.07).
    let failed = 0;
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return;
      failed += 1;
      console.error('[billing] pending payment reconciliation failed', {
        orderId: orders[index]?.id,
        error: result.reason,
      });
    });
    return {
      checked: orders.length,
      reconciled: results.filter(
        (result) => result.status === 'fulfilled' && result.value
      ).length,
      failed,
    };
  }

  private async reconcilePendingPaymentOrder(
    order: PaymentOrderRecord,
    now: Date,
    options: { allowRenewalCreate: boolean }
  ): Promise<void> {
    let providerPaymentId = order.providerPaymentId;
    const isRenewal = order.metadata?.renewal === true;
    const renewalRequest = readRenewalRequestSnapshot(order.metadata);
    const access = isRenewal
      ? await this.deps.repository.findAccessByUserId(order.userId)
      : null;
    const expectedRenewalAccess = getExpectedRenewalAccess(
      access,
      order.metadata
    );
    const plan = isRenewal ? findBillingPlan(order.planId) : null;
    const renewalAttemptNumber =
      readRenewalAttemptNumber(order.metadata) ??
      Math.max(1, access?.chargeAttempts ?? 1);
    const storedGeneration = readRenewalAccessProviderPaymentId(
      order.metadata
    );
    const legacyRenewalAccess =
      storedGeneration === undefined &&
      access &&
      order.metadata?.accessId === access.id
        ? access
        : null;

    const isRecordedTerminalRenewalFailure =
      isRenewal &&
      ['failed', 'canceled', 'verification_failed'].includes(order.status);
    if (!providerPaymentId && isRecordedTerminalRenewalFailure) {
      const storedErrorKind = readRenewalMetadataString(
        order.metadata,
        'renewalErrorKind'
      );
      let unknownProviderOutcome =
        storedGeneration === undefined ||
        !storedErrorKind ||
        storedErrorKind === 'indeterminate' ||
        storedErrorKind === 'transient';
      if (unknownProviderOutcome) {
        // Неопределённость разрешается фактами: ищем платёж этого заказа в
        // списке платежей YooKassa вместо вечного карантина.
        const located = await this.locateProviderlessRenewalPayment(
          order,
          now
        );
        if (
          located.kind === 'found' &&
          (await this.bindLocatedRenewalPayment(order, located.payment))
        ) {
          providerPaymentId = located.payment.id;
        } else if (located.kind === 'absent') {
          // Провайдер подтвердил: платежа не существует, списание не
          // начиналось. Исход определён — карантин не нужен.
          unknownProviderOutcome = false;
          await this.deps.repository.updatePaymentOrder({
            id: order.id,
            onlyIfUnfulfilled: true,
            metadata: {
              renewalErrorKind: 'not_attempted',
              renewalQuarantined: false,
              renewalRetryAt: null,
            },
            mergeMetadata: true,
          });
        } else if (!providerPaymentId) {
          await this.quarantineRenewalOrder(
            order.id,
            readRenewalMetadataString(
              order.metadata,
              'renewalErrorDiagnostic'
            ) ??
              'Исход автосписания без идентификатора платежа YooKassa неизвестен',
            now
          );
        }
      }
      if (!providerPaymentId) {
        if (order.metadata?.renewalFailureHandled === true) return;
        // Legacy-код не сохранял generation и помечал failed даже при 5xx.
        // По тому же accessId считаем исход старого POST неизвестным и
        // fail-close, чтобы новый key не списал дважды. updatedAt не подходит:
        // подарок тоже меняет его, не создавая новое платёжное соглашение.
        const accessForFailure =
          expectedRenewalAccess ?? legacyRenewalAccess;
        if (
          !access ||
          !accessForFailure ||
          !access.autoRenew ||
          !plan
        ) {
          await this.deps.repository.markRenewalFailureHandled({
            orderId: order.id,
            now,
          });
          return;
        }
        if (
          !unknownProviderOutcome &&
          !(await this.isRenewalPaymentMethodCurrent(order))
        ) {
          await this.deps.repository.markRenewalFailureHandled({
            orderId: order.id,
            now,
          });
          return;
        }

        const attemptedPaymentMethodId =
          readRenewalMetadataString(
            order.metadata,
            'renewalFailedPaymentMethodId'
          ) ?? renewalRequest?.paymentMethodId ?? '';
        const invalidCurrentPaymentMethod =
          storedErrorKind === 'invalid_payment_method'
            ? await this.deletePaymentMethodIfCurrent(
                order.userId,
                attemptedPaymentMethodId
              )
            : false;
        const error =
          readRenewalMetadataString(
            order.metadata,
            'renewalErrorDiagnostic'
          ) ??
          (order.status === 'verification_failed'
            ? 'Автосписание подтверждено, но сумма или валюта не совпадает с заказом'
            : `Списание отклонено (${order.status})`);
        await this.handleChargeFailure(
          { ...accessForFailure, chargeAttempts: renewalAttemptNumber },
          plan,
          error,
          now,
          {
            permanent:
              unknownProviderOutcome ||
              order.status === 'verification_failed' ||
              invalidCurrentPaymentMethod,
            requireNoActivePaymentMethod: invalidCurrentPaymentMethod,
            expectedActivePaymentMethodId:
              !unknownProviderOutcome &&
              !invalidCurrentPaymentMethod &&
              attemptedPaymentMethodId
                ? attemptedPaymentMethodId
                : undefined,
            chargeAttemptsTo: renewalAttemptNumber,
            handledOrderId: order.id,
            manualReviewRequired: unknownProviderOutcome,
          }
        );
        return;
      }
      // Платёж найден поиском — продолжаем обычной GET-сверкой ниже.
    }

    if (!providerPaymentId) {
      if (!isRenewal || !access || !plan) return;
      const requestMatchesOrder = Boolean(
        renewalRequest &&
          renewalRequest.planId === order.planId &&
          renewalRequest.amountRub === order.amountRub
      );
      const currentPaymentMethod =
        await this.deps.repository.findPaymentMethodByUserId(order.userId);
      const consentStillCurrent = Boolean(
        expectedRenewalAccess &&
          access.autoRenew &&
          currentPaymentMethod?.status === 'active' &&
          currentPaymentMethod.providerPaymentMethodId ===
            renewalRequest?.paymentMethodId
      );
      const requestCanBeRepeated =
        requestMatchesOrder &&
        consentStillCurrent &&
        isPendingPaymentStatus(order.status) &&
        now.getTime() - order.createdAt.getTime() <
          YOOKASSA_IDEMPOTENCE_SAFE_WINDOW_MS;
      // Kill-switch запрещает инициировать даже same-key POST. Уже созданные
      // платежи по-прежнему можно сверять GET-запросами, включая поиск ниже.
      if (requestCanBeRepeated && !options.allowRenewalCreate) {
        await this.scheduleRenewalOrderReconciliation(
          order.id,
          now,
          AUTO_RENEW_INDETERMINATE_RETRY_AFTER_MS
        );
        return;
      }
      if (!requestCanBeRepeated) {
        // Same-key повтор невозможен, но неопределённость всё ещё можно
        // разрешить фактами: ищем платёж заказа в списке платежей YooKassa.
        const located = await this.locateProviderlessRenewalPayment(
          order,
          now
        );
        if (
          located.kind === 'found' &&
          (await this.bindLocatedRenewalPayment(order, located.payment))
        ) {
          providerPaymentId = located.payment.id;
        } else if (located.kind === 'absent') {
          // Провайдер подтвердил отсутствие платежа: списание не начиналось,
          // двойное списание исключено. Закрываем заказ без карантина.
          const error =
            'Платёж по заказу не найден в YooKassa: автосписание не начиналось';
          await this.deps.repository.updatePaymentOrder({
            id: order.id,
            status: 'canceled',
            onlyIfUnfulfilled: true,
            metadata: {
              renewalErrorKind: 'not_attempted',
              renewalErrorDiagnostic: error,
              renewalQuarantined: false,
              renewalRetryAt: null,
            },
            mergeMetadata: true,
          });
          await this.deps.repository.markRenewalFailureHandled({
            orderId: order.id,
            now,
          });
          if (consentStillCurrent && expectedRenewalAccess) {
            // Согласие в силе, а старый POST доказуемо не состоялся — новая
            // попытка с новым заказом безопасна и не ждёт следующего цикла.
            await this.deps.repository.rescheduleAccessChargeVerification({
              accessId: access.id,
              chargeAttempts: Math.max(0, renewalAttemptNumber - 1),
              retryAt: now,
              expectedProviderPaymentId:
                expectedRenewalAccess.providerPaymentId,
              expectedActivePaymentMethodId:
                renewalRequest?.paymentMethodId,
              now,
            });
          }
          return;
        } else {
          const alreadyQuarantined =
            order.metadata?.renewalQuarantined === true;
          const alreadyHandled =
            order.metadata?.renewalFailureHandled === true;
          const error =
            consentStillCurrent
              ? 'Небезопасно повторять незавершённое автосписание без идентификатора платежа YooKassa'
              : 'Автосписание не возобновлено: согласие или сохранённый способ оплаты уже изменились';
          if (alreadyQuarantined && alreadyHandled) {
            // Повторный проход авторазрешения: только продлеваем backoff,
            // без повторных писем, алертов и записей об ошибке.
            await this.quarantineRenewalOrder(
              order.id,
              readRenewalMetadataString(
                order.metadata,
                'renewalErrorDiagnostic'
              ) ?? error,
              now
            );
            return;
          }
          await this.quarantineRenewalOrder(order.id, error, now);
          const accessAtRisk =
            expectedRenewalAccess ?? legacyRenewalAccess;
          if (accessAtRisk?.autoRenew) {
            // Исход старого POST неизвестен, а same-key повтор уже небезопасен.
            // Новый order/key мог бы привести к двойному списанию.
            await this.handleChargeFailure(
              {
                ...accessAtRisk,
                chargeAttempts: renewalAttemptNumber,
              },
              plan,
              error,
              now,
              {
                permanent: true,
                chargeAttemptsTo: renewalAttemptNumber,
                handledOrderId: order.id,
                manualReviewRequired: true,
              }
            );
          } else {
            await this.deps.repository.markRenewalFailureHandled({
              orderId: order.id,
              now,
            });
          }
          await this.notifyPaymentIssueTelegram({
            stage: 'auto_renewal_failed',
            userId: order.userId,
            orderId: order.id,
            planId: order.planId,
            message: error,
          });
          return;
        }
      }

      if (!providerPaymentId) {
      this.requireYooKassaConfig();
      try {
        const payment = await retryIndeterminateYooKassaRequest(async () =>
          await createYooKassaRecurringPayment({
            ...this.deps.config.yookassa,
            idempotenceKey: order.id,
            amountRub: renewalRequest!.amountRub,
            description: renewalRequest!.description,
            paymentMethodId: renewalRequest!.paymentMethodId,
            metadata: {
              orderId: order.id,
              userId: order.userId,
              planId: renewalRequest!.planId,
            },
            receipt: renewalRequest!.receiptEmail
              ? buildYooKassaReceipt({
                  email: renewalRequest!.receiptEmail,
                  amountRub: renewalRequest!.amountRub,
                  description: renewalRequest!.description,
                })
              : undefined,
          })
        );
        providerPaymentId = payment.id;
        await this.deps.repository.updatePaymentOrder({
          id: order.id,
          providerPaymentId,
          status: payment.status || 'pending',
          onlyIfUnfulfilled: true,
        });
      } catch (error) {
        await this.handleYooKassaChargeError({
          claimed: {
            ...expectedRenewalAccess!,
            chargeAttempts: renewalAttemptNumber,
          },
          plan,
          order,
          error,
          now,
          requestKind: 'create',
          paymentMethodId: renewalRequest!.paymentMethodId,
          renewalAttemptNumber,
        });
        return;
      }
      }
    }

    this.requireYooKassaConfig();
    let verified: Awaited<ReturnType<typeof getYooKassaPayment>>;
    try {
      verified = await retryIndeterminateYooKassaRequest(async () =>
        await getYooKassaPayment(
          this.deps.config.yookassa,
          providerPaymentId!
        )
      );
    } catch (error) {
      if (!isRenewal || !access || !plan) throw error;
      if (!expectedRenewalAccess || !access.autoRenew) {
        const errorInfo = extractYooKassaApiError(error);
        const errorKind = classifyYooKassaRecurringPaymentError(errorInfo);
        if (errorKind !== 'indeterminate' && errorKind !== 'transient') {
          await this.deps.repository.updatePaymentOrder({
            id: order.id,
            status: 'failed',
            onlyIfUnfulfilled: true,
            metadata: {
              renewalErrorKind: errorKind,
              renewalErrorDiagnostic: formatYooKassaApiError(errorInfo),
            },
            mergeMetadata: true,
          });
          await this.deps.repository.markRenewalFailureHandled({
            orderId: order.id,
            now,
          });
        }
        return;
      }
      await this.handleYooKassaChargeError({
        claimed: {
          ...expectedRenewalAccess,
          chargeAttempts: renewalAttemptNumber,
        },
        plan,
        order,
        error,
        now,
        requestKind: 'verify',
        paymentMethodId: renewalRequest?.paymentMethodId ?? null,
        renewalAttemptNumber,
      });
      return;
    }

    await this.applyVerifiedYooKassaPayment(order, verified, 'pending-sweep');
    if (!isRenewal) return;

    if (verified.status === 'succeeded' && verified.paid) {
      await this.finalizeDeferredRenewalPayment(order, verified, now);
      return;
    }
    if (!access || !plan) return;
    if (isPendingPaymentStatus(verified.status)) {
      await this.scheduleRenewalOrderReconciliation(
        order.id,
        now,
        AUTO_RENEW_INDETERMINATE_RETRY_AFTER_MS
      );
      if (expectedRenewalAccess && access.autoRenew) {
        await this.deps.repository.rescheduleAccessChargeVerification({
          accessId: access.id,
          chargeAttempts: Math.max(0, renewalAttemptNumber - 1),
          retryAt: new Date(
            now.getTime() + AUTO_RENEW_INDETERMINATE_RETRY_AFTER_MS
          ),
          expectedProviderPaymentId:
            expectedRenewalAccess.providerPaymentId,
          expectedActivePaymentMethodId:
            renewalRequest?.paymentMethodId,
          expectedPendingOrderId: order.id,
          now,
        });
      }
      return;
    }
    await this.finalizeDeferredRenewalPayment(order, verified, now);
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
    returnPath?: string;
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

    let order: PaymentOrderRecord;
    try {
      order = recipientEmail
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
            ...(plan.type === 'pass'
              ? {
                  accessPaymentFlow: 'checkout' as const,
                  conflictingPassPlanIds: getPassPlans().map(
                    (passPlan) => passPlan.id
                  ),
                }
              : {}),
          });
    } catch (error) {
      if (error instanceof RenewalPaymentQuarantinedError) {
        throw apiError(
          'E_CONFLICT',
          'Статус предыдущего автосписания ещё проверяется. Чтобы избежать повторного списания, новая покупка временно недоступна. Проверка идёт автоматически — обновите страницу через 15–20 минут; если статус не изменится за час, напишите в поддержку.'
        );
      }
      if (error instanceof PassCheckoutInProgressError) {
        throw apiError(
          'E_CONFLICT',
          'Предыдущая оплата ещё не завершена. Вернитесь к открытому окну оплаты или обновите страницу немного позже.'
        );
      }
      throw error;
    }

    // Чек 54-ФЗ: передаём receipt, если у пользователя указан email
    // (паттерн Mentala: без email платёж уходит без чека из кода).
    const description = recipientEmail
      ? `Гласно ${plan.name}, подарок`
      : `Гласно ${plan.name}`;

    // Куда виджет вернёт пользователя после оплаты. Для embedded это
    // передаётся не в теле платежа, а фронту — он отдаёт URL виджету.
    const returnUrl = buildYooKassaReturnUrl(
      this.appUrl,
      order.id,
      params.returnPath
    );

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
        // Автопродление: просим YooKassa сохранить выбранный способ оплаты.
        // Плательщик видит уведомление о сохранении на платёжной странице.
        savePaymentMethod: autoRenew,
        // Требование документации виджета: без идентификатора покупателя
        // виджет не запоминает карту и не предложит её при следующей оплате.
        merchantCustomerId: email ?? params.userId,
      });
      const confirmationToken = getYooKassaConfirmationToken(payment);
      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        providerPaymentId: payment.id,
        status: payment.status || 'pending',
        onlyIfUnfulfilled: true,
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
        onlyIfUnfulfilled: true,
      });
      if (recipientEmail) {
        await this.deps.repository.cancelGiftOrder({ orderId: order.id });
      }
      // E_UPSTREAM отдаётся клиенту как «обработанная» ошибка и не попадает
      // в общий алерт unhandled-исключений — шлём платёжный алерт явно.
      await this.notifyPaymentIssueTelegram({
        stage: 'checkout_create_failed',
        userId: params.userId,
        orderId: order.id,
        planId: plan.id,
        message: err instanceof Error ? err.message : String(err),
      });
      if (err && typeof err === 'object' && 'data' in err) {
        throw apiError('E_UPSTREAM', 'YooKassa отклонила создание платежа');
      }
      throw err;
    }
  }

  // Клиент сообщает, что окно оплаты не открылось (скрипт платёжного
  // виджета не загрузился — типовая причина: VPN у пользователя). Сервер
  // об этом сам не узнает: checkout завершился успешно, а сбой произошёл
  // в браузере.
  async reportCheckoutIssue(params: {
    userId: string | null | undefined;
    orderId?: string | null;
  }): Promise<void> {
    if (!params.userId) {
      throw apiError('E_AUTH', 'Требуется вход в профиль');
    }
    const order = params.orderId
      ? await this.deps.repository.findPaymentOrderById(params.orderId)
      : null;
    // Чужой заказ не раскрываем, но алерт всё равно шлём — сбой виджета
    // случается и до создания заказа.
    const ownOrder = order && order.userId === params.userId ? order : null;
    await this.notifyPaymentIssueTelegram({
      stage: 'widget_load_failed',
      userId: params.userId,
      orderId: ownOrder?.id ?? null,
      planId: ownOrder?.planId ?? null,
      message:
        'Скрипт платёжного виджета не загрузился в браузере (вероятно, VPN)',
    });
  }

  async handleYooKassaWebhook(payload: unknown): Promise<void> {
    const event = extractYooKassaPaymentEvent(payload);
    // Неподписанные поля используем только как дешёвый локальный prefilter:
    // неизвестный UUID/payment id не должен провоцировать внешний GET.
    const candidate = event.orderId
      ? await this.deps.repository.findPaymentOrderById(event.orderId)
      : await this.deps.repository.findPaymentOrderByProviderPaymentId(
          event.providerPaymentId
        );
    if (
      !candidate ||
      (candidate.providerPaymentId !== null &&
        candidate.providerPaymentId !== event.providerPaymentId)
    ) {
      console.warn('[billing] yookassa webhook: unknown order', {
        providerPaymentId: event.providerPaymentId,
        event: event.event,
      });
      return;
    }
    // orderId из тела webhook не подписан и не является источником истины.
    // Сначала читаем платёж напрямую у YooKassa, затем используем metadata,
    // сохранённые нашим сервером при создании платежа.
    this.requireYooKassaConfig();
    const verified = await getYooKassaPayment(
      this.deps.config.yookassa,
      event.providerPaymentId
    );
    const verifiedOrderId = readVerifiedMetadataString(
      verified.metadata,
      'orderId'
    );
    const order =
      verifiedOrderId === candidate.id
        ? candidate
        : verifiedOrderId
          ? await this.deps.repository.findPaymentOrderById(verifiedOrderId)
          : null;
    if (!order) {
      // Неизвестный заказ: отвечаем 200, иначе YooKassa будет ретраить
      // вечно, а злоумышленник получит сигнал для перебора.
      console.warn('[billing] yookassa webhook: unknown order', {
        providerPaymentId: event.providerPaymentId,
        event: event.event,
      });
      return;
    }

    try {
      await this.applyVerifiedYooKassaPayment(order, verified, event.event);
      await this.finalizeDeferredRenewalPayment(order, verified, new Date());
    } catch (error) {
      if (!(error instanceof YooKassaPaymentCorrelationError)) throw error;
      console.error('[billing] yookassa webhook correlation mismatch', {
        eventOrderId: event.orderId,
        verifiedOrderId,
        providerPaymentId: verified.id,
        localOrderId: order.id,
      });
    }
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
    userId: string | null | undefined,
    methodType: YooKassaBindablePaymentMethodType = 'bank_card'
  ): Promise<{
    methodType: YooKassaBindablePaymentMethodType;
    confirmationUrl: string;
  }> {
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
        returnUrl: buildBindingReturnUrl(this.appUrl),
        methodType,
      });
    } catch (err) {
      // Без диагностики провайдера отказ выглядит одинаково для «магазин не
      // умеет автоплатежи» и «этот способ недоступен именно здесь».
      console.error('[billing] payment method binding failed', {
        methodType,
        diagnostic: formatYooKassaApiError(extractYooKassaApiError(err)),
      });
      if (isYooKassaRecurringPaymentsUnavailable(err)) {
        throw apiError(
          'E_FORBIDDEN',
          methodType === 'sbp'
            ? 'Автопродление по СБП недоступно для этого магазина YooKassa. Привяжите карту или напишите в поддержку.'
            : 'Автопродление ещё не подключено для магазина. Обратитесь в поддержку YooKassa.'
        );
      }
      throw apiError(
        'E_UPSTREAM',
        'Не удалось начать привязку способа оплаты в YooKassa'
      );
    }
    // Карту подтверждают редиректом на страницу банка, счёт СБП — ссылкой
    // НСПК: на телефоне она открывает выбор банка, на десктопе показывается
    // QR-кодом. Для приложения это одинаковый «адрес подтверждения».
    const confirmationUrl =
      binding.confirmation?.confirmation_url ??
      binding.confirmation?.confirmation_data;
    if (!binding.id || !confirmationUrl) {
      throw apiError(
        'E_UPSTREAM',
        'YooKassa не вернула ссылку для привязки способа оплаты. Проверьте, что для магазина включено сохранение платёжных методов.'
      );
    }

    await this.deps.repository.savePendingPaymentMethod({
      userId,
      providerPaymentMethodId: binding.id,
      methodType,
    });

    return { methodType, confirmationUrl };
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
    let remote: Awaited<ReturnType<typeof getYooKassaPaymentMethod>>;
    try {
      remote = await getYooKassaPaymentMethod(
        this.deps.config.yookassa,
        method.providerPaymentMethodId
      );
    } catch (error) {
      if (!isYooKassaNotFound(error)) throw error;
      // Способа с таким идентификатором у провайдера нет. У карты он может
      // появиться с задержкой, поэтому даём окно на дозревание; после него
      // запись — мусор (так выглядит фантомный id из платежа по СБП).
      if (
        Date.now() - method.createdAt.getTime() >=
        PENDING_PAYMENT_METHOD_GRACE_MS
      ) {
        await this.deps.repository.deletePaymentMethodIfMatches({
          userId,
          providerPaymentMethodId: method.providerPaymentMethodId,
        });
      }
      return;
    }

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
        enableAutoRenewForActiveAccess: true,
      });
      return;
    }

    // Привязка отклонена/протухла — убираем pending-запись.
    if (remote.status === 'inactive' || remote.status === 'canceled') {
      await this.deps.repository.deletePaymentMethodIfMatches({
        userId,
        providerPaymentMethodId: method.providerPaymentMethodId,
      });
    }
  }

  // Отвязка способа оплаты = электронный отказ от сохранённых платёжных данных
  // (376-ФЗ): способ оплаты удаляется, автопродление выключается
  // безусловно. Текущий оплаченный период остаётся активным до конца.
  async unbindPaymentMethod(userId: string | null | undefined): Promise<void> {
    if (!userId) {
      throw apiError('E_AUTH', 'Войдите в профиль');
    }
    await this.deps.repository.revokeRecurringPaymentConsent({
      userId,
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
          'Сначала привяжите способ оплаты. Он нужен для автопродления.'
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
    const updated = await this.deps.repository.setAccessAutoRenew({
      userId: params.userId,
      autoRenew: params.enabled,
    });
    if (params.enabled && !updated) {
      throw apiError(
        'E_VALIDATION',
        'Не удалось включить автопродление: проверьте активный доступ и способ оплаты.'
      );
    }
  }

  // Автопродление при обращении пользователя к биллинг-статусу (по образцу
  // Mentala). Работает как бэкап к фоновому обходу runAutoRenewalSweep.
  // Безопасно вызывать часто: claim-паттерн не даст списать дважды.
  async maybeRunAutoRenewal(userId: string | null | undefined): Promise<void> {
    if (!userId) return;
    if (process.env.BILLING_RENEWAL_DISABLED === 'true') return;
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
        const chargeProcessed = await this.chargeAccess(access, now);
        if (chargeProcessed) {
          processed += 1;
        } else {
          failed += 1;
        }
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
  // сроки — в resolveRenewalNoticeLeadMs. Идемпотентно:
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
        horizonMs: RENEWAL_NOTICE_MAX_LEAD_MS,
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
        const leadMs = resolveRenewalNoticeLeadMs(plan.durationDays);
        if (leadMs === null) {
          // Короткий пропуск: предуведомление не шлём совсем — покупка свежая,
          // подтверждение придёт по факту списания.
          skipped += 1;
          continue;
        }
        if (access.nextChargeAt.getTime() - now.getTime() > leadMs) {
          // Ещё рано — запись попадёт в один из следующих обходов.
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
          pricingUrl: buildPricingUrl(this.appUrl),
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

  private async finalizeDeferredRenewalPayment(
    order: PaymentOrderRecord,
    verified: Awaited<ReturnType<typeof getYooKassaPayment>>,
    now: Date,
    knownAccess?: PaidAccessRecord
  ): Promise<void> {
    if (order.metadata?.renewal !== true) return;
    const plan = findBillingPlan(order.planId);
    if (!plan) return;

    const amountMatched =
      verified.amountValue === order.amountRub.toFixed(2) &&
      verified.currency === 'RUB';
    if (verified.status === 'succeeded' && verified.paid && amountMatched) {
      await this.notifyRenewalChargedOnce(order, {
        userId: order.userId,
        planName: plan.name,
        amountRub: order.amountRub,
      });
      return;
    }
    if (verified.status === 'succeeded' && verified.paid && !amountMatched) {
      const error =
        'Автосписание подтверждено, но сумма или валюта не совпадает с заказом';
      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        status: 'verification_failed',
        onlyIfUnfulfilled: true,
        metadata: {
          renewalErrorDiagnostic: error,
          renewalQuarantined: true,
          renewalRetryAt: null,
        },
        mergeMetadata: true,
      });
      if (order.metadata?.renewalFailureHandled === true) return;
      if (!(await this.isRenewalPaymentMethodCurrent(order))) {
        await this.deps.repository.markRenewalFailureHandled({
          orderId: order.id,
          now,
        });
        return;
      }

      const access =
        (await this.deps.repository.findAccessByUserId(order.userId)) ??
        knownAccess ??
        null;
      const expectedRenewalAccess = getExpectedRenewalAccess(
        access,
        order.metadata
      );
      if (!access?.autoRenew || !expectedRenewalAccess) {
        await this.deps.repository.markRenewalFailureHandled({
          orderId: order.id,
          now,
        });
        return;
      }
      const renewalAttemptNumber =
        readRenewalAttemptNumber(order.metadata) ??
        Math.max(1, expectedRenewalAccess.chargeAttempts);
      await this.handleChargeFailure(
        {
          ...expectedRenewalAccess,
          chargeAttempts: renewalAttemptNumber,
        },
        plan,
        error,
        now,
        {
          permanent: true,
          chargeAttemptsTo: renewalAttemptNumber,
          handledOrderId: order.id,
          expectedActivePaymentMethodId:
            readRenewalRequestSnapshot(order.metadata)?.paymentMethodId,
          manualReviewRequired: true,
        }
      );
      return;
    }
    if (!(await this.isRenewalPaymentMethodCurrent(order))) {
      await this.deps.repository.markRenewalFailureHandled({
        orderId: order.id,
        now,
      });
      return;
    }
    if (
      verified.status !== 'canceled' &&
      verified.status !== 'failed'
    ) {
      return;
    }
    if (order.metadata.renewalFailureHandled === true) return;

    const access =
      (await this.deps.repository.findAccessByUserId(order.userId)) ??
      knownAccess ??
      null;
    const expectedRenewalAccess = getExpectedRenewalAccess(
      access,
      order.metadata
    );
    if (!access?.autoRenew || !expectedRenewalAccess) {
      await this.deps.repository.markRenewalFailureHandled({
        orderId: order.id,
        now,
      });
      return;
    }

    const cancellationDetails = [
      verified.cancellationParty
        ? `party=${verified.cancellationParty}`
        : null,
      verified.cancellationReason
        ? `reason=${verified.cancellationReason}`
        : null,
    ].filter(Boolean);
    const error =
      cancellationDetails.length > 0
        ? `Списание отклонено (${verified.status}; ${cancellationDetails.join('; ')})`
        : `Списание отклонено (${verified.status})`;
    const permanentPaymentMethodReason = Boolean(
      verified.cancellationReason &&
        PERMANENT_PAYMENT_METHOD_CANCELLATION_REASONS.has(
          verified.cancellationReason
        )
    );
    const attemptedPaymentMethodId =
      verified.paymentMethod?.id ??
      readRenewalRequestSnapshot(order.metadata)?.paymentMethodId ??
      '';
    const permanentPaymentMethodFailure = permanentPaymentMethodReason
      ? await this.deletePaymentMethodIfCurrent(
          order.userId,
          attemptedPaymentMethodId
        )
      : false;
    const renewalAttemptNumber =
      readRenewalAttemptNumber(order.metadata) ??
      Math.max(1, expectedRenewalAccess.chargeAttempts);
    await this.handleChargeFailure(
      { ...expectedRenewalAccess, chargeAttempts: renewalAttemptNumber },
      plan,
      error,
      now,
      {
        permanent: permanentPaymentMethodFailure,
        requireNoActivePaymentMethod: permanentPaymentMethodFailure,
        expectedActivePaymentMethodId: permanentPaymentMethodFailure
          ? undefined
          : attemptedPaymentMethodId || undefined,
        chargeAttemptsTo: renewalAttemptNumber,
        handledOrderId: order.id,
      }
    );
  }

  private async notifyRenewalChargedOnce(
    order: PaymentOrderRecord,
    params: { userId: string; planName: string; amountRub: number }
  ): Promise<void> {
    const claimed =
      await this.deps.repository.claimRenewalSuccessNotification({
        orderId: order.id,
      });
    if (!claimed) return;
    await this.notifyRenewalCharged(params);
  }

  // Подтверждение состоявшегося автопродления. Уходит всем, независимо от
  // срока пропуска. Никогда не бросает: сбой письма не должен откатывать
  // уже выданный доступ.
  private async notifyRenewalCharged(params: {
    userId: string;
    planName: string;
    amountRub: number;
  }): Promise<void> {
    try {
      const email = await this.deps.repository.findUserEmail(params.userId);
      if (!email) return;
      const access = await this.deps.repository.findAccessByUserId(
        params.userId
      );
      if (!access) return;
      await sendRenewalChargedEmail({
        to: email,
        planName: params.planName,
        amountRub: params.amountRub,
        accessUntil: access.currentPeriodEnd,
        pricingUrl: buildPricingUrl(this.appUrl),
      });
    } catch (err) {
      console.error('[billing] renewal charged email failed', {
        userId: params.userId,
        err,
      });
    }
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
  ): Promise<boolean> {
    const userId = due.userId;
    const claimed = await this.deps.repository.claimAccessForCharge({
      accessId: due.id,
      retryAfterMs: AUTO_RENEW_RETRY_AFTER_MS,
      maxAttempts: AUTO_RENEW_MAX_ATTEMPTS,
      now,
    });
    if (!claimed) return true;

    const plan = findBillingPlan(claimed.renewalPlanId ?? claimed.planId);
    if (!plan) {
      await this.deps.repository.recordAccessChargeError({
        accessId: claimed.id,
        error: 'Тариф продления не найден',
        disableAutoRenew: true,
        expectedProviderPaymentId: claimed.providerPaymentId,
        now,
      });
      return false;
    }

    this.requireYooKassaConfig();
    // Цена продления зафиксирована при покупке: изменение каталога уже
    // обещанное продление не удорожает.
    const amountRub = claimed.renewalAmountRub ?? plan.priceRub;
    const unfinishedOrder =
      await this.deps.repository.findUnfulfilledRenewalPaymentOrder({
        userId,
        accessId: claimed.id,
      });

    if (unfinishedOrder) {
      const ownsOrderLease =
        await this.deps.repository.claimPaymentOrderReconciliation({
          orderId: unfinishedOrder.id,
          now,
          leaseUntil: new Date(
            now.getTime() + PAYMENT_RECONCILIATION_LEASE_MS
          ),
        });
      if (!ownsOrderLease) {
        await this.deps.repository.rescheduleAccessChargeVerification({
          accessId: claimed.id,
          chargeAttempts: Math.max(0, claimed.chargeAttempts - 1),
          retryAt: new Date(
            now.getTime() + AUTO_RENEW_INDETERMINATE_RETRY_AFTER_MS
          ),
          expectedProviderPaymentId: claimed.providerPaymentId,
          expectedPendingOrderId: unfinishedOrder.id,
          now,
        });
        return true;
      }
    }

    if (unfinishedOrder?.metadata?.renewalQuarantined === true) {
      const error =
        readRenewalMetadataString(
          unfinishedOrder.metadata,
          'renewalErrorDiagnostic'
        ) ?? 'Исход предыдущего автосписания требует ручной сверки';
      const quarantinedAccess = getExpectedRenewalAccess(
        claimed,
        unfinishedOrder.metadata
      );
      if (quarantinedAccess) {
        await this.handleChargeFailure(
          quarantinedAccess,
          plan,
          error,
          now,
          {
            permanent: true,
            handledOrderId: unfinishedOrder.id,
            manualReviewRequired: true,
          }
        );
      } else {
        await this.deps.repository.markRenewalFailureHandled({
          orderId: unfinishedOrder.id,
          now,
        });
      }
      return false;
    }

    let order: PaymentOrderRecord;
    let renewalRequest: RenewalRequestSnapshot | null;
    let renewalAttemptNumber: number;
    if (unfinishedOrder) {
      const persistedRequest = readRenewalRequestSnapshot(
        unfinishedOrder.metadata
      );
      const requestMatchesOrder = Boolean(
        persistedRequest &&
          persistedRequest.planId === unfinishedOrder.planId &&
          persistedRequest.amountRub === unfinishedOrder.amountRub
      );
      // Старый заказ с уже известным providerPaymentId безопасно проверяется
      // GET-запросом даже без нового snapshot. Без providerPaymentId повторять
      // legacy POST с новым ключом/телом нельзя.
      if (!requestMatchesOrder && !unfinishedOrder.providerPaymentId) {
        const error =
          'Небезопасно повторять автосписание: у заказа отсутствует неизменяемый снимок запроса';
        await this.quarantineRenewalOrder(unfinishedOrder.id, error, now);
        // Без снимка нельзя доказать, что старый POST не дошёл до YooKassa.
        // Новый order/key мог бы списать деньги второй раз, поэтому текущее
        // соглашение безопасно останавливаем до ручной перепривязки.
        await this.handleChargeFailure(claimed, plan, error, now, {
          permanent: true,
          handledOrderId: unfinishedOrder.id,
          manualReviewRequired: true,
        });
        await this.notifyPaymentIssueTelegram({
          stage: 'auto_renewal_failed',
          userId,
          orderId: unfinishedOrder.id,
          planId: plan.id,
          message: error,
        });
        return false;
      }
      order = unfinishedOrder;
      renewalRequest = requestMatchesOrder ? persistedRequest : null;
      // Legacy-код уже увеличивал счётчик до создания заказа. Текущий claim
      // добавил ещё единицу только ради проверки его статуса — откатываем её.
      renewalAttemptNumber =
        readRenewalAttemptNumber(order.metadata) ??
        Math.max(1, claimed.chargeAttempts - 1);
    } else {
      const method =
        await this.deps.repository.findPaymentMethodByUserId(userId);
      if (!method || method.status !== 'active') {
        // Способа оплаты нет (гонка с отвязкой) — списывать нечем.
        // CAS по отсутствию активного метода не даёт позднему чтению
        // выключить только что перепривязанный новый способ.
        await this.handleChargeFailure(
          claimed,
          plan,
          'Сохранённый способ оплаты не найден',
          now,
          {
            permanent: true,
            requireNoActivePaymentMethod: true,
          }
        );
        return false;
      }

      const receiptEmail = await this.deps.repository.findUserEmail(userId);
      renewalRequest = {
        amountRub,
        description: `Гласно ${plan.name} (автопродление)`,
        paymentMethodId: method.providerPaymentMethodId,
        planId: plan.id,
        receiptEmail,
      };
      const metadata = {
        userId,
        planId: plan.id,
        renewal: true,
        autoRenew: true,
        accessId: claimed.id,
        renewalCycleEnd: claimed.currentPeriodEnd.toISOString(),
        renewalAttemptNumber: claimed.chargeAttempts,
        renewalAccessProviderPaymentId: claimed.providerPaymentId,
        renewalRequest,
      };
      let createdOrder: PaymentOrderRecord;
      try {
        createdOrder = await this.deps.repository.createPaymentOrder({
          userId,
          planId: plan.id,
          amountRub,
          currency: 'RUB',
          metadata,
          accessPaymentFlow: 'renewal',
          conflictingPassPlanIds: getPassPlans().map(
            (passPlan) => passPlan.id
          ),
          renewalAccessGuard: {
            accessId: claimed.id,
            providerPaymentId: claimed.providerPaymentId,
            currentPeriodEnd: claimed.currentPeriodEnd,
          },
        });
      } catch (error) {
        if (error instanceof RenewalAccessChangedError) {
          const liveAccess =
            await this.deps.repository.findAccessByUserId(userId);
          if (liveAccess?.autoRenew) {
            await this.deps.repository.rescheduleAccessChargeVerification({
              accessId: liveAccess.id,
              chargeAttempts: Math.max(0, claimed.chargeAttempts - 1),
              retryAt: liveAccess.currentPeriodEnd,
              expectedProviderPaymentId: liveAccess.providerPaymentId,
              now,
            });
          }
          return true;
        }
        if (!(error instanceof PassCheckoutInProgressError)) throw error;
        await this.deps.repository.rescheduleAccessChargeVerification({
          accessId: claimed.id,
          chargeAttempts: Math.max(0, claimed.chargeAttempts - 1),
          retryAt: new Date(
            now.getTime() + AUTO_RENEW_INDETERMINATE_RETRY_AFTER_MS
          ),
          expectedProviderPaymentId: claimed.providerPaymentId,
          expectedActivePaymentMethodId: method.providerPaymentMethodId,
          now,
        });
        return true;
      }
      // Репозиторий возвращает те же metadata. Явное объединение также
      // защищает application-слой от неполной тестовой/альтернативной реализации.
      order = { ...createdOrder, providerPaymentId: null, metadata };
      renewalAttemptNumber = claimed.chargeAttempts;
      const ownsOrderLease =
        await this.deps.repository.claimPaymentOrderReconciliation({
          orderId: order.id,
          now,
          leaseUntil: new Date(
            now.getTime() + PAYMENT_RECONCILIATION_LEASE_MS
          ),
        });
      if (!ownsOrderLease) {
        await this.deps.repository.rescheduleAccessChargeVerification({
          accessId: claimed.id,
          chargeAttempts: Math.max(0, claimed.chargeAttempts - 1),
          retryAt: new Date(
            now.getTime() + AUTO_RENEW_INDETERMINATE_RETRY_AFTER_MS
          ),
          expectedProviderPaymentId: claimed.providerPaymentId,
          expectedActivePaymentMethodId: method.providerPaymentMethodId,
          expectedPendingOrderId: order.id,
          now,
        });
        return true;
      }
    }

    const expectedRenewalAccess = getExpectedRenewalAccess(
      claimed,
      order.metadata
    );

    let providerPaymentId = order.providerPaymentId;
    if (!providerPaymentId) {
      const [liveAccess, livePaymentMethod] = await Promise.all([
        this.deps.repository.findAccessByUserId(userId),
        this.deps.repository.findPaymentMethodByUserId(userId),
      ]);
      // После успешного claim запись доступа не может исчезнуть штатно:
      // отвязка лишь меняет autoRenew. Fallback нужен альтернативным
      // репозиториям/тестам, а реальный opt-out всё равно вернёт живую строку.
      const currentAccess = liveAccess ?? claimed;
      const liveExpectedRenewalAccess = getExpectedRenewalAccess(
        currentAccess,
        order.metadata
      );
      const consentStillCurrent = Boolean(
        currentAccess.autoRenew &&
          liveExpectedRenewalAccess &&
          livePaymentMethod?.status === 'active' &&
          livePaymentMethod.providerPaymentMethodId ===
            renewalRequest?.paymentMethodId
      );
      if (!consentStillCurrent) {
        const error =
          'Автосписание не начато: согласие или сохранённый способ оплаты уже изменились';
        if (unfinishedOrder) {
          await this.quarantineRenewalOrder(order.id, error, now);
        } else {
          await this.deps.repository.updatePaymentOrder({
            id: order.id,
            status: 'canceled',
            onlyIfUnfulfilled: true,
            metadata: {
              renewalErrorKind: 'not_attempted',
              renewalErrorDiagnostic: error,
            },
            mergeMetadata: true,
          });
        }
        if (liveExpectedRenewalAccess && currentAccess.autoRenew) {
          await this.handleChargeFailure(
            {
              ...liveExpectedRenewalAccess,
              chargeAttempts: renewalAttemptNumber,
            },
            plan,
            error,
            now,
            {
              permanent: true,
              chargeAttemptsTo: renewalAttemptNumber,
              handledOrderId: order.id,
              expectedActivePaymentMethodId: unfinishedOrder
                ? undefined
                : renewalRequest?.paymentMethodId,
              manualReviewRequired: Boolean(unfinishedOrder),
            }
          );
        } else {
          await this.deps.repository.markRenewalFailureHandled({
            orderId: order.id,
            now,
          });
        }
        return false;
      }
      if (
        unfinishedOrder &&
        now.getTime() - order.createdAt.getTime() >=
          YOOKASSA_IDEMPOTENCE_SAFE_WINDOW_MS
      ) {
        const error =
          'Небезопасно повторять автосписание: истекло гарантированное окно Idempotence-Key YooKassa';
        await this.quarantineRenewalOrder(order.id, error, now);
        await this.handleChargeFailure(
          {
            ...liveExpectedRenewalAccess!,
            chargeAttempts: renewalAttemptNumber,
          },
          plan,
          error,
          now,
          {
            permanent: true,
            chargeAttemptsTo: renewalAttemptNumber,
            handledOrderId: order.id,
            manualReviewRequired: true,
          }
        );
        console.error('[billing] auto-renewal idempotence window expired', {
          userId,
          accessId: claimed.id,
          orderId: order.id,
        });
        await this.notifyPaymentIssueTelegram({
          stage: 'auto_renewal_failed',
          userId,
          orderId: order.id,
          planId: plan.id,
          message: error,
        });
        return false;
      }

      const recurringPaymentInput = {
        ...this.deps.config.yookassa,
        idempotenceKey: order.id,
        amountRub: renewalRequest!.amountRub,
        description: renewalRequest!.description,
        paymentMethodId: renewalRequest!.paymentMethodId,
        metadata: {
          orderId: order.id,
          userId,
          planId: renewalRequest!.planId,
        },
        receipt: renewalRequest!.receiptEmail
          ? buildYooKassaReceipt({
              email: renewalRequest!.receiptEmail,
              amountRub: renewalRequest!.amountRub,
              description: renewalRequest!.description,
            })
          : undefined,
      };

      let payment: Awaited<ReturnType<typeof createYooKassaRecurringPayment>>;
      try {
        payment = await retryIndeterminateYooKassaRequest(async () =>
          await createYooKassaRecurringPayment(recurringPaymentInput)
        );
      } catch (error) {
        return await this.handleYooKassaChargeError({
          claimed: {
            ...liveExpectedRenewalAccess!,
            chargeAttempts: renewalAttemptNumber,
          },
          plan,
          order,
          error,
          now,
          requestKind: 'create',
          paymentMethodId: renewalRequest!.paymentMethodId,
          renewalAttemptNumber,
        });
      }

      providerPaymentId = payment.id;
      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        providerPaymentId,
        status: payment.status || 'pending',
        onlyIfUnfulfilled: true,
      });
    }

    let verified: Awaited<ReturnType<typeof getYooKassaPayment>>;
    try {
      verified = await retryIndeterminateYooKassaRequest(async () =>
        await getYooKassaPayment(
          this.deps.config.yookassa,
          providerPaymentId
        )
      );
    } catch (error) {
      if (!expectedRenewalAccess) {
        const errorInfo = extractYooKassaApiError(error);
        const errorKind = classifyYooKassaRecurringPaymentError(errorInfo);
        if (errorKind !== 'indeterminate' && errorKind !== 'transient') {
          await this.deps.repository.updatePaymentOrder({
            id: order.id,
            status: 'failed',
            onlyIfUnfulfilled: true,
            metadata: {
              renewalErrorKind: errorKind,
              renewalErrorDiagnostic: formatYooKassaApiError(errorInfo),
            },
            mergeMetadata: true,
          });
          await this.deps.repository.markRenewalFailureHandled({
            orderId: order.id,
            now,
          });
        }
        return false;
      }
      return await this.handleYooKassaChargeError({
        claimed: {
          ...expectedRenewalAccess,
          chargeAttempts: renewalAttemptNumber,
        },
        plan,
        order,
        error,
        now,
        requestKind: 'verify',
        paymentMethodId: renewalRequest?.paymentMethodId ?? null,
        renewalAttemptNumber,
      });
    }

    // Верифицируем и выдаём продление тем же путём, что и обычные оплаты.
    await this.applyVerifiedYooKassaPayment(order, verified, 'auto-renewal');

    const amountMatched =
      verified.amountValue === order.amountRub.toFixed(2) &&
      verified.currency === 'RUB';
    if (verified.status === 'succeeded' && verified.paid) {
      await this.finalizeDeferredRenewalPayment(
        order,
        verified,
        now,
        expectedRenewalAccess ?? claimed
      );
      return amountMatched;
    }

    if (isPendingPaymentStatus(verified.status)) {
      // Один provider payment может проверяться много раз. Храним номер
      // именно платёжной попытки, а claim для очередного GET откатываем.
      await this.scheduleRenewalOrderReconciliation(
        order.id,
        now,
        AUTO_RENEW_INDETERMINATE_RETRY_AFTER_MS
      );
      if (expectedRenewalAccess) {
        await this.deps.repository.rescheduleAccessChargeVerification({
          accessId: claimed.id,
          // Пока платёж не получил финальный статус, он не расходует лимит
          // отказов. Metadata заказа хранит его будущий номер попытки.
          chargeAttempts: Math.max(0, renewalAttemptNumber - 1),
          retryAt: new Date(
            now.getTime() + AUTO_RENEW_INDETERMINATE_RETRY_AFTER_MS
          ),
          expectedProviderPaymentId:
            expectedRenewalAccess.providerPaymentId,
          expectedActivePaymentMethodId:
            renewalRequest?.paymentMethodId,
          expectedPendingOrderId: order.id,
          now,
        });
      }
      return true;
    }

    if (verified.status === 'canceled' || verified.status === 'failed') {
      await this.finalizeDeferredRenewalPayment(
        order,
        verified,
        now,
        expectedRenewalAccess ?? claimed
      );
      return false;
    }

    return true;
  }

  private async deletePaymentMethodIfCurrent(
    userId: string,
    attemptedPaymentMethodId: string
  ): Promise<boolean> {
    if (!attemptedPaymentMethodId) return false;
    return await this.deps.repository.deletePaymentMethodIfMatches({
      userId,
      providerPaymentMethodId: attemptedPaymentMethodId,
    });
  }

  private async scheduleRenewalOrderReconciliation(
    orderId: string,
    now: Date,
    retryAfterMs: number
  ): Promise<void> {
    await this.deps.repository.updatePaymentOrder({
      id: orderId,
      onlyIfUnfulfilled: true,
      metadata: {
        renewalRetryAt: new Date(
          now.getTime() + retryAfterMs
        ).toISOString(),
      },
      mergeMetadata: true,
    });
  }

  private async quarantineRenewalOrder(
    orderId: string,
    diagnostic: string,
    now: Date
  ): Promise<void> {
    await this.deps.repository.updatePaymentOrder({
      id: orderId,
      status: 'indeterminate',
      onlyIfUnfulfilled: true,
      metadata: {
        renewalErrorDiagnostic: diagnostic,
        renewalQuarantined: true,
        // Карантин перепроверяется автоматически: sweep ищет платёж заказа
        // в списке платежей YooKassa, backoff защищает API от частых проходов.
        renewalRetryAt: new Date(
          now.getTime() + RENEWAL_QUARANTINE_RECHECK_AFTER_MS
        ).toISOString(),
      },
      mergeMetadata: true,
    });
  }

  // Поиск платежа заказа, у которого не сохранился providerPaymentId
  // (упавший POST, legacy-заказ). Совпадение — по metadata.orderId: его
  // пишет наш сервер в каждый созданный платёж.
  private async locateProviderlessRenewalPayment(
    order: PaymentOrderRecord,
    now: Date
  ): Promise<
    | { kind: 'found'; payment: Awaited<ReturnType<typeof getYooKassaPayment>> }
    | { kind: 'absent' }
    | { kind: 'unknown' }
  > {
    try {
      this.requireYooKassaConfig();
      // POST с Idempotence-Key = order.id мог уйти только между созданием
      // заказа и концом same-key окна; запас покрывает расхождение часов.
      const searchFrom = new Date(
        order.createdAt.getTime() - PROVIDERLESS_PAYMENT_SEARCH_SKEW_MS
      );
      const searchTo = new Date(
        Math.min(
          now.getTime(),
          order.createdAt.getTime() + YOOKASSA_IDEMPOTENCE_SAFE_WINDOW_MS
        ) + PROVIDERLESS_PAYMENT_SEARCH_SKEW_MS
      );
      let cursor: string | null = null;
      for (
        let page = 0;
        page < PROVIDERLESS_PAYMENT_SEARCH_MAX_PAGES;
        page += 1
      ) {
        const result = await listYooKassaPayments(
          this.deps.config.yookassa,
          {
            createdAtGte: searchFrom,
            createdAtLte: searchTo,
            cursor,
            limit: 100,
          }
        );
        const match = result.items.find(
          (item) =>
            readVerifiedMetadataString(item.metadata, 'orderId') === order.id
        );
        if (match) return { kind: 'found', payment: match };
        if (!result.nextCursor) {
          return now.getTime() - order.createdAt.getTime() >=
            PROVIDERLESS_PAYMENT_ABSENCE_MIN_AGE_MS
            ? { kind: 'absent' }
            : { kind: 'unknown' };
        }
        cursor = result.nextCursor;
      }
      // Окно не дочитано до конца — отсутствие платежа не доказано.
      return { kind: 'unknown' };
    } catch (error) {
      console.error('[billing] renewal payment search failed', {
        orderId: order.id,
        error,
      });
      return { kind: 'unknown' };
    }
  }

  private async bindLocatedRenewalPayment(
    order: PaymentOrderRecord,
    payment: Awaited<ReturnType<typeof getYooKassaPayment>>
  ): Promise<boolean> {
    const bound =
      await this.deps.repository.bindPaymentOrderProviderPaymentId({
        orderId: order.id,
        providerPaymentId: payment.id,
      });
    if (!bound) return false;
    // Идентификатор найден — неопределённости больше нет: дальше платёж
    // ведут обычная GET-сверка и webhook.
    await this.deps.repository.updatePaymentOrder({
      id: order.id,
      providerPaymentId: payment.id,
      status: payment.status || 'pending',
      onlyIfUnfulfilled: true,
      metadata: {
        renewalQuarantined: false,
        renewalRetryAt: null,
      },
      mergeMetadata: true,
    });
    return true;
  }

  // Пригоден ли сохранённый провайдером способ для автосписаний. При сетевой
  // ошибке не гадаем: оставляем pending, следующая синхронизация перепроверит.
  private async resolveSavedPaymentMethodStatus(
    providerPaymentMethodId: string
  ): Promise<'active' | 'pending'> {
    try {
      const method = await getYooKassaPaymentMethod(
        this.deps.config.yookassa,
        providerPaymentMethodId
      );
      return method.status === 'active' || method.saved === true
        ? 'active'
        : 'pending';
    } catch (error) {
      // 404 — способа не существует (так выглядит фантомный id по СБП).
      // Сетевую ошибку тоже не считаем подтверждением: в обоих случаях
      // способ остаётся pending и будет перепроверен синхронизацией.
      if (!isYooKassaNotFound(error)) {
        console.error('[billing] payment method verification failed', {
          providerPaymentMethodId,
          error,
        });
      }
      return 'pending';
    }
  }

  private async isRenewalPaymentMethodCurrent(
    order: PaymentOrderRecord
  ): Promise<boolean> {
    const snapshot = readRenewalRequestSnapshot(order.metadata);
    // Legacy-order без снимка обрабатываем fail-close: его исход неизвестен,
    // а доказать смену метода по старым данным невозможно.
    if (!snapshot) return true;
    const current = await this.deps.repository.findPaymentMethodByUserId(
      order.userId
    );
    return Boolean(
      current?.status === 'active' &&
        current.providerPaymentMethodId === snapshot.paymentMethodId
    );
  }

  private async handleYooKassaChargeError(params: {
    claimed: PaidAccessRecord;
    plan: BillingPlanConfig;
    order: PaymentOrderRecord;
    error: unknown;
    now: Date;
    requestKind: 'create' | 'verify';
    paymentMethodId: string | null;
    renewalAttemptNumber: number;
  }): Promise<false> {
    const errorInfo = extractYooKassaApiError(params.error);
    const errorKind = classifyYooKassaRecurringPaymentError(errorInfo);
    const diagnostic = formatYooKassaApiError(errorInfo);
    const invalidPaymentMethod = errorKind === 'invalid_payment_method';
    const invalidCurrentPaymentMethod =
      invalidPaymentMethod && params.paymentMethodId
        ? await this.deletePaymentMethodIfCurrent(
            params.claimed.userId,
            params.paymentMethodId
          )
        : false;

    // При 5xx/timeout результат POST неизвестен, а 429 требует backoff:
    // заказ и его Idempotence-Key сохраняются. Только определённый отказ
    // переводит заказ в terminal-состояние.
    const retryableWithoutAttempt =
      errorKind === 'indeterminate' || errorKind === 'transient';
    const retryAfterMs =
      errorKind === 'transient'
        ? AUTO_RENEW_TRANSIENT_RETRY_AFTER_MS
        : errorKind === 'indeterminate'
          ? AUTO_RENEW_INDETERMINATE_RETRY_AFTER_MS
          : AUTO_RENEW_RETRY_AFTER_MS;
    if (!retryableWithoutAttempt) {
      await this.deps.repository.updatePaymentOrder({
        id: params.order.id,
        status: 'failed',
        onlyIfUnfulfilled: true,
        metadata: {
          renewalErrorKind: errorKind,
          renewalErrorDiagnostic: diagnostic,
          renewalFailedPaymentMethodId: params.paymentMethodId,
          renewalRetryAt: null,
        },
        mergeMetadata: true,
      });
    } else {
      await this.deps.repository.updatePaymentOrder({
        id: params.order.id,
        onlyIfUnfulfilled: true,
        metadata: {
          renewalRetryAt: new Date(
            params.now.getTime() + retryAfterMs
          ).toISOString(),
        },
        mergeMetadata: true,
      });
    }
    // Guard защищает от того, что запоздалая ошибка старого способа затрёт
    // только что перепривязанный новый. Но если негодный способ удалили мы
    // сами парой строк выше, guard сработал бы на собственное удаление и
    // проглотил бы обработку отказа целиком: автопродление осталось бы
    // включённым, без ошибки, письма, лога и алерта. В этой ветке гарантию
    // даёт CAS requireNoActivePaymentMethod внутри handleChargeFailure.
    if (
      !invalidCurrentPaymentMethod &&
      !(await this.isRenewalPaymentMethodCurrent(params.order))
    ) {
      if (!retryableWithoutAttempt) {
        await this.deps.repository.markRenewalFailureHandled({
          orderId: params.order.id,
          now: params.now,
        });
      }
      return false;
    }
    await this.handleChargeFailure(
      params.claimed,
      params.plan,
      diagnostic,
      params.now,
      {
        permanent: invalidCurrentPaymentMethod,
        requireNoActivePaymentMethod: invalidCurrentPaymentMethod,
        expectedActivePaymentMethodId: invalidCurrentPaymentMethod
          ? undefined
          : params.paymentMethodId ?? undefined,
        consumeAttempt: !retryableWithoutAttempt,
        chargeAttemptsTo:
          retryableWithoutAttempt
            ? Math.max(0, params.renewalAttemptNumber - 1)
            : params.requestKind === 'verify'
              ? params.renewalAttemptNumber
              : undefined,
        handledOrderId:
          retryableWithoutAttempt ? undefined : params.order.id,
        retryAfterMs,
      }
    );
    console.error('[billing] auto-renewal charge failed', {
      userId: params.claimed.userId,
      accessId: params.claimed.id,
      requestKind: params.requestKind,
      diagnostic,
    });
    await this.notifyPaymentIssueTelegram({
      stage: 'auto_renewal_failed',
      userId: params.claimed.userId,
      orderId: params.order.id,
      planId: params.plan.id,
      message: diagnostic,
    });
    return false;
  }

  // Неудачное списание: фиксируем ошибку; после финальной попытки выключаем
  // автопродление и шлём письмо с CTA «обновить способ оплаты и продлить».
  private async handleChargeFailure(
    claimed: PaidAccessRecord,
    plan: BillingPlanConfig,
    error: string,
    now: Date,
    options: {
      permanent?: boolean;
      retryAfterMs?: number;
      consumeAttempt?: boolean;
      chargeAttemptsTo?: number;
      handledOrderId?: string;
      requireNoActivePaymentMethod?: boolean;
      expectedActivePaymentMethodId?: string;
      manualReviewRequired?: boolean;
    } = {}
  ): Promise<void> {
    // chargeAttempts в claimed — уже после инкремента этой попытки.
    const consumeAttempt = options.consumeAttempt !== false;
    const finalFailure =
      options.permanent === true ||
      (consumeAttempt && claimed.chargeAttempts >= AUTO_RENEW_MAX_ATTEMPTS);
    const retryAt = finalFailure
      ? null
      : new Date(
          now.getTime() +
            (options.retryAfterMs ?? AUTO_RENEW_RETRY_AFTER_MS)
        );
    const recorded = await this.deps.repository.recordAccessChargeError({
      accessId: claimed.id,
      error,
      disableAutoRenew: finalFailure,
      ...(retryAt ? { retryAt } : {}),
      ...(options.chargeAttemptsTo !== undefined
        ? { restoreChargeAttemptsTo: options.chargeAttemptsTo }
        : !consumeAttempt && !finalFailure
        ? {
            restoreChargeAttemptsTo: Math.max(
              0,
              claimed.chargeAttempts - 1
            ),
          }
        : {}),
      expectedProviderPaymentId: claimed.providerPaymentId,
      ...(options.expectedActivePaymentMethodId
        ? {
            expectedActivePaymentMethodId:
              options.expectedActivePaymentMethodId,
          }
        : {}),
      ...(options.requireNoActivePaymentMethod
        ? { requireNoActivePaymentMethod: true }
        : {}),
      ...(consumeAttempt && retryAt
        ? { deferRetryUntilPeriodEnd: true }
        : {}),
      now,
    });
    const firstFailureHandling = options.handledOrderId
      ? await this.deps.repository.markRenewalFailureHandled({
          orderId: options.handledOrderId,
          now,
        })
      : true;
    if (!recorded || !firstFailureHandling) return;
    if (!finalFailure) return;
    try {
      const email = await this.deps.repository.findUserEmail(claimed.userId);
      if (!email) return;
      if (options.manualReviewRequired) {
        await sendRenewalManualReviewEmail({
          to: email,
          planName: plan.name,
          amountRub: claimed.renewalAmountRub ?? plan.priceRub,
          profileUrl: buildProfileUrl(this.appUrl),
        });
      } else {
        await sendRenewalFailedEmail({
          to: email,
          planName: plan.name,
          amountRub: claimed.renewalAmountRub ?? plan.priceRub,
          pricingUrl: buildPricingUrl(this.appUrl),
        });
      }
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
    assertYooKassaPaymentMatchesOrder(order, verified);
    const providerPaymentBound =
      await this.deps.repository.bindPaymentOrderProviderPaymentId({
        orderId: order.id,
        providerPaymentId: verified.id,
      });
    if (!providerPaymentBound) {
      throw new YooKassaPaymentCorrelationError(
        'Provider payment is already bound to another order'
      );
    }
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
      onlyIfUnfulfilled: true,
      monotonicProviderStatus: true,
      metadata: {
        paymentStatusSource: source,
        verifiedStatus: verified.status,
        verifiedAmount: verified.amountValue,
        verifiedCurrency: verified.currency,
        amountMatched: amountOk,
        ...(order.metadata?.renewal === true &&
        (verified.status === 'canceled' || verified.status === 'failed')
          ? {
              // Provider id + финальный статус атомарно устраняют
              // неопределённость старого POST.
              renewalQuarantined: false,
              renewalRetryAt: null,
            }
          : {}),
      },
      mergeMetadata: true,
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
              // Флаг saved у платежа — обещание, а не факт. Способ считается
              // пригодным для автосписаний только после подтверждения в
              // /v3/payment_methods; иначе он остаётся pending и не включает
              // автопродление, которое мы не смогли бы исполнить.
              status: (await this.resolveSavedPaymentMethodStatus(
                verified.paymentMethod.id
              )) satisfies 'active' | 'pending',
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
        ...(order.metadata?.renewal === true
          ? {
              requireExistingAutoRenewConsent: true,
              expectedPaymentMethodId:
                readRenewalRequestSnapshot(order.metadata)?.paymentMethodId ??
                verified.paymentMethod?.id ??
                null,
              expectedAccessProviderPaymentId:
                readRenewalAccessProviderPaymentId(order.metadata),
            }
          : {}),
        paymentMethod: savedMethod,
      });
      // Только на реальную первую выдачу доступа — не на повторный вебхук/поллинг
      // уже выполненного заказа (fulfillPaidOrder идемпотентен).
      if (fulfillResult.fulfilled) {
        await this.notifyBillingPurchaseTelegram(order, plan);
      }
    } else if (paymentOk && !plan) {
      // Заказ на несуществующий тариф (данные из старой dev-схемы):
      // доступ не выдаём и переводим в dead-letter, иначе succeeded без
      // fulfilledAt будет бесконечно занимать очередь сверки.
      await this.deps.repository.updatePaymentOrder({
        id: order.id,
        status: 'verification_failed',
        onlyIfUnfulfilled: true,
        metadata: {
          billingErrorDiagnostic: `Неизвестный тариф: ${order.planId}`,
          ...(order.metadata?.renewal === true
            ? { renewalQuarantined: true }
            : {}),
        },
        mergeMetadata: true,
      });
      if (order.metadata?.renewal === true) {
        await this.deps.repository.markRenewalFailureHandled({
          orderId: order.id,
        });
      }
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
      conversion:
        paymentOk && plan
          ? {
              planType: plan.type,
              amountRub: order.amountRub,
            }
          : null,
    });
  }

  // Алерт о проблеме на платёжном пути. Никогда не бросает: сбой алерта не
  // должен ломать (и тем более маскировать) исходную ошибку оплаты.
  private async notifyPaymentIssueTelegram(params: {
    stage: 'widget_load_failed' | 'checkout_create_failed' | 'auto_renewal_failed';
    userId: string;
    orderId?: string | null;
    planId?: string | null;
    message?: string | null;
  }): Promise<void> {
    if (!this.deps.telegramAlerts) return;
    try {
      const email = await this.deps.repository.findUserEmail(params.userId);
      await this.deps.telegramAlerts.notifyPaymentIssue({
        stage: params.stage,
        user: {
          id: params.userId,
          email,
          telegramId: null,
          telegramUsername: null,
          displayName: null,
        },
        orderId: params.orderId,
        planId: params.planId,
        message: params.message,
      });
    } catch (err) {
      console.error('[billing] payment issue alert failed', {
        stage: params.stage,
        err,
      });
    }
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
    conversion?: { planType: BillingPlanType; amountRub: number } | null;
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
      conversion: params.conversion ?? null,
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

class YooKassaPaymentCorrelationError extends Error {}

function assertYooKassaPaymentMatchesOrder(
  order: PaymentOrderRecord,
  verified: Awaited<ReturnType<typeof getYooKassaPayment>>
): void {
  const verifiedOrderId = readVerifiedMetadataString(
    verified.metadata,
    'orderId'
  );
  const verifiedUserId = readVerifiedMetadataString(
    verified.metadata,
    'userId'
  );
  const verifiedPlanId = readVerifiedMetadataString(
    verified.metadata,
    'planId'
  );
  if (
    verifiedOrderId !== order.id ||
    (order.providerPaymentId !== null &&
      order.providerPaymentId !== verified.id) ||
    (verifiedUserId !== null && verifiedUserId !== order.userId) ||
    (verifiedPlanId !== null && verifiedPlanId !== order.planId)
  ) {
    throw new YooKassaPaymentCorrelationError(
      'Verified YooKassa payment does not match the local order'
    );
  }
}

function readVerifiedMetadataString(
  metadata: Record<string, unknown>,
  key: string
): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function buildYooKassaReturnUrl(
  appUrl: string,
  orderId: string,
  returnPath?: string
): string {
  const base = `${appUrl.replace(/\/$/, '')}/`;
  const path =
    returnPath && isSafeBillingReturnPath(returnPath) ? returnPath : '/pricing';
  const url = new URL(path, base);
  // Защита в глубину: даже валидный по regexp путь не должен уводить
  // с нашего origin (например, при будущем ослаблении whitelist).
  if (url.origin !== new URL(base).origin) {
    return buildYooKassaReturnUrl(appUrl, orderId);
  }
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

function buildProfileUrl(appUrl: string): string {
  return new URL('/profile', `${appUrl.replace(/\/$/, '')}/`).toString();
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
