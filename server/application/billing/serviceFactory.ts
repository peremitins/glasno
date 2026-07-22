import type { H3Event } from 'h3';
import { BillingService } from './billingService';
import { DrizzleBillingRepository } from '@/server/infrastructure/billing/drizzleBillingRepository';
import { createTelegramAlertsServiceFromConfig } from '@/server/application/telegram/serviceFactory';
import { resolveBillingAppUrl } from './appUrl';

// Минимально необходимый срез runtime-конфига: фабрику вызывают и хендлеры
// (с event), и Nitro-плагин фонового воркера (без event).
interface BillingRuntimeConfig {
  yookassaShopId?: unknown;
  yookassaSecretKey?: unknown;
  telegramAlertsBotToken?: unknown;
  telegramAlertsChatId?: unknown;
  public: { appUrl?: unknown };
}

export function createBillingService(event: H3Event): BillingService {
  return createBillingServiceFromConfig(useRuntimeConfig(event));
}

export function createBillingServiceFromConfig(
  config: BillingRuntimeConfig
): BillingService {
  return new BillingService({
    repository: new DrizzleBillingRepository(),
    config: {
      yookassa: {
        shopId: config.yookassaShopId as string,
        secretKey: config.yookassaSecretKey as string,
      },
      appUrl: resolveBillingAppUrl(config.public.appUrl),
    },
    telegramAlerts: createTelegramAlertsServiceFromConfig(config),
  });
}
