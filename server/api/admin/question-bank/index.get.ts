import {
  AdminQuestionBankListQueryDto,
  AdminQuestionBankListResponseDto,
} from '@/shared/dto';
import { createAdminQuestionBankService } from '@/server/application/questionBank/adminServiceFactory';
import { defineApiHandler } from '@/server/utils/handler';
import { requireRole } from '@/server/utils/requireRole';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  requireRole(session?.role, 'admin');

  const query = AdminQuestionBankListQueryDto.parse(getQuery(event));
  const response = await createAdminQuestionBankService().list(query);
  return AdminQuestionBankListResponseDto.parse(response);
});
