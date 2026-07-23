import type { TelegramAlertsPort } from '@/server/interface/telegramAlerts';
import { logger } from '@/server/utils/logger';
import {
  formatCriticalErrorAlert,
  formatPaymentIssueAlert,
  formatSubscriptionPurchasedAlert,
  formatTrialAbuseSuspectedAlert,
  formatUserDeletedAlert,
  formatUserRegisteredAlert,
  formatVoiceMinutesPurchasedAlert,
  type PaymentIssueStage,
  type TelegramAlertUserInfo,
} from './telegramAlerts.formatter';

// Сбой доставки в Telegram никогда не должен ронять бизнес-флоу (регистрацию,
// удаление аккаунта, оплату) — все методы гарантированно не бросают исключение.
export class TelegramAlertsService {
  constructor(private readonly port: TelegramAlertsPort) {}

  async notifyUserRegistered(user: TelegramAlertUserInfo): Promise<void> {
    await this.safeSend(formatUserRegisteredAlert(user));
  }

  async notifyUserDeleted(user: TelegramAlertUserInfo): Promise<void> {
    await this.safeSend(formatUserDeletedAlert(user));
  }

  async notifySubscriptionPurchased(params: {
    user: TelegramAlertUserInfo;
    planName: string;
    amountRub: number;
    isRenewal: boolean;
  }): Promise<void> {
    await this.safeSend(formatSubscriptionPurchasedAlert(params));
  }

  async notifyVoiceMinutesPurchased(params: {
    user: TelegramAlertUserInfo;
    planName: string;
    minutes: number;
    amountRub: number;
  }): Promise<void> {
    await this.safeSend(formatVoiceMinutesPurchasedAlert(params));
  }

  async notifyPaymentIssue(params: {
    stage: PaymentIssueStage;
    user?: TelegramAlertUserInfo | null;
    orderId?: string | null;
    planId?: string | null;
    message?: string | null;
  }): Promise<void> {
    await this.safeSend(formatPaymentIssueAlert(params));
  }

  async notifyTrialAbuseSuspected(params: {
    trialCount: number;
    windowHours: number;
    ipHashPrefix: string;
  }): Promise<void> {
    await this.safeSend(formatTrialAbuseSuspectedAlert(params));
  }

  async notifyCriticalError(params: {
    route: string;
    requestId?: string | null;
    message: string;
  }): Promise<void> {
    await this.safeSend(formatCriticalErrorAlert(params));
  }

  private async safeSend(text: string): Promise<void> {
    try {
      await this.port.send(text);
    } catch (err) {
      logger.error({ err }, '[telegram] alert service failed to send');
    }
  }
}
