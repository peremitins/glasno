import {
  QuestionBankListQueryDto,
  QuestionBankListResponseDto,
} from '@/shared/dto';
import { createQuestionBankService } from '@/server/application/questionBank/serviceFactory';
import { defineApiHandler } from '@/server/utils/handler';
import { requireRole } from '@/server/utils/requireRole';

export default defineApiHandler(async (event) => {
  requireRole(event.context.session?.role, 'admin');
  const filters = QuestionBankListQueryDto.parse(getQuery(event));
  const service = createQuestionBankService();
  const response = await service.listPublic(filters);
  return QuestionBankListResponseDto.parse(response);
});
