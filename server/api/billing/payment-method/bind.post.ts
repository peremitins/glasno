import { BillingBindCardResponseDto } from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

// Явная привязка карты без платежа (по образцу Mentala): возвращает
// confirmationUrl YooKassa, куда фронт редиректит пользователя.
export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session?.userId) {
    throw apiError('E_AUTH', 'Войдите в профиль');
  }

  const result = await createBillingService(event).startPaymentMethodBinding(
    session.userId
  );
  return BillingBindCardResponseDto.parse(result);
});
