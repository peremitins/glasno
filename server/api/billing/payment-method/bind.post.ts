import {
  BillingBindCardRequestDto,
  BillingBindCardResponseDto,
} from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

// Явная привязка способа оплаты без платежа — единственный путь, дающий
// идентификатор, пригодный для автосписаний: payment_method.id из обычного
// платежа таким идентификатором может не быть (по СБП там id самого платежа).
// Возвращает адрес подтверждения: страницу банка для карты, ссылку НСПК для СБП.
export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session?.userId) {
    throw apiError('E_AUTH', 'Войдите в профиль');
  }

  const body = BillingBindCardRequestDto.parse(
    (await readBody(event).catch(() => null)) ?? {}
  );
  const result = await createBillingService(event).startPaymentMethodBinding(
    session.userId,
    body.methodType
  );
  return BillingBindCardResponseDto.parse(result);
});
