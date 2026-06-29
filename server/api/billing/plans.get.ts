import { BillingPlansResponseDto } from '@/shared/dto';
import { createBillingService } from '@/server/application/billing/serviceFactory';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler((event) => {
  const service = createBillingService(event);
  return BillingPlansResponseDto.parse(service.getPlans());
});

