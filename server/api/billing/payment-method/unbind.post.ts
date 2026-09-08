import { BillingSimpleResponseDto } from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

// Отвязка карты автосписания: карта удаляется,
// автопродление выключается, оплаченный период остаётся до конца.
export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session?.userId) {
    throw apiError('E_AUTH', 'Войдите в профиль');
  }

  await createBillingService(event).unbindPaymentMethod(session.userId);
  return BillingSimpleResponseDto.parse({ ok: true });
});
