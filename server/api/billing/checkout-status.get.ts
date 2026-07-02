import { BillingPaymentStatusResponseDto } from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const userId = event.context.session?.userId;
  if (!userId) {
    throw apiError('E_AUTH', 'Для проверки оплаты войдите в профиль');
  }

  const query = getQuery(event);
  const orderId =
    typeof query.orderId === 'string' && query.orderId.trim()
      ? query.orderId.trim()
      : null;

  const service = createBillingService(event);
  const status = await service.reconcileYooKassaCheckout({ userId, orderId });
  return BillingPaymentStatusResponseDto.parse(status);
});
