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

  // По образцу Mentala current.get: при обращении к статусу опортунистически
  // (1) подтверждаем pending-привязку карты, (2) пробуем автосписание.
  // Ошибки этих шагов не должны ломать выдачу статуса.
  try {
    await service.syncPendingPaymentMethod(session.userId ?? null);
  } catch (err) {
    console.error('[billing] payment method sync failed', err);
  }
  try {
    await service.maybeRunAutoRenewal(session.userId ?? null);
  } catch (err) {
    console.error('[billing] auto-renewal check failed', err);
  }

  const status = await service.getStatus({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    role: session.role ?? null,
  });

  return BillingStatusResponseDto.parse(status);
});

