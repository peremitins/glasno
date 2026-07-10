import { BillingPaymentHistoryResponseDto } from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const query = getQuery(event);
  const limitValue = Number(query.limit ?? 20);
  const limit = Number.isFinite(limitValue)
    ? Math.min(50, Math.max(1, Math.trunc(limitValue)))
    : 20;
  const cursor =
    typeof query.cursor === 'string' && query.cursor ? query.cursor : null;
  const history = await createBillingService(event).getPaymentHistory({
    userId: event.context.session?.userId,
    cursor,
    limit,
  });
  return BillingPaymentHistoryResponseDto.parse(history);
});
