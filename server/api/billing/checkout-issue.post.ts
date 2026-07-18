import {
  BillingCheckoutIssueRequestDto,
  BillingCheckoutIssueResponseDto,
} from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const input = await readDto(event, BillingCheckoutIssueRequestDto);
  const service = createBillingService(event);
  await service.reportCheckoutIssue({
    userId: event.context.session?.userId,
    orderId: input.orderId,
  });
  return BillingCheckoutIssueResponseDto.parse({ ok: true });
});
