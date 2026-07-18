import {
  BillingCheckoutRequestDto,
  BillingCheckoutResponseDto,
} from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const input = await readDto(event, BillingCheckoutRequestDto);
  const service = createBillingService(event);
  const checkout = await service.createCheckout({
    userId: event.context.session?.userId,
    role: event.context.session?.role,
    planId: input.planId,
    autoRenew: input.autoRenew,
    gift: input.gift,
    returnPath: input.returnPath,
  });
  return BillingCheckoutResponseDto.parse(checkout);
});
