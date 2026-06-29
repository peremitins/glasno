import type { H3Event } from 'h3';
import { BillingService } from './billingService';
import { DrizzleBillingRepository } from '@/server/infrastructure/billing/drizzleBillingRepository';

export function createBillingService(event: H3Event): BillingService {
  const config = useRuntimeConfig(event);
  return new BillingService({
    repository: new DrizzleBillingRepository(),
    config: {
      yookassa: {
        shopId: config.yookassaShopId as string,
        secretKey: config.yookassaSecretKey as string,
      },
      appUrl: (config.public.appUrl || 'http://localhost:3000') as string,
    },
  });
}

