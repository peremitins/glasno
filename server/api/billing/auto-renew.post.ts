import {
  BillingAutoRenewRequestDto,
  BillingSimpleResponseDto,
} from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

// Включение/выключение автопродления. Включить можно только при
// привязанной карте (карта сохраняется при оплате подписки).
export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session?.userId) {
    throw apiError('E_AUTH', 'Войдите в профиль');
  }

  const input = await readDto(event, BillingAutoRenewRequestDto);
  await createBillingService(event).setAutoRenew({
    userId: session.userId,
    enabled: input.enabled,
  });
  return BillingSimpleResponseDto.parse({ ok: true });
});
