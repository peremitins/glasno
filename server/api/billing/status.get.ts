import { BillingStatusResponseDto } from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) {
    throw apiError('E_AUTH', 'Сессия не инициализирована');
  }

  const service = createBillingService(event);
  const status = await service.getStatus({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    role: session.role ?? null,
  });

  return BillingStatusResponseDto.parse(status);
});

