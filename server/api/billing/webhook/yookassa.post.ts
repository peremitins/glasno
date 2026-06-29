import { BillingWebhookResponseDto } from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const payload = await readBody(event);
  const service = createBillingService(event);
  await service.handleYooKassaWebhook(payload);
  return BillingWebhookResponseDto.parse({ ok: true });
});

