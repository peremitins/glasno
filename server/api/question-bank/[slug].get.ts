import { QuestionBankItemResponseDto } from '@/shared/dto';
import { createQuestionBankService } from '@/server/application/questionBank/serviceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { requireRole } from '@/server/utils/requireRole';

export default defineApiHandler(async (event) => {
  requireRole(event.context.session?.role, 'admin');
  const slug = getRouterParam(event, 'slug');
  if (!slug) {
    throw apiError('E_VALIDATION', 'Не указан slug вопроса');
  }

  const service = createQuestionBankService();
  const item = await service.findPublicBySlug(slug);
  const related = await service.findRelated(item);
  return QuestionBankItemResponseDto.parse({ item, related });
});
