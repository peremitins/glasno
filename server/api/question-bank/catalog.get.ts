import {
  AdminQuestionBankListResponseDto,
  QuestionCatalogListQueryDto,
} from '@/shared/dto';
import { createQuestionCatalogService } from '@/server/application/questionBank/catalogServiceFactory';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { requireRole } from '@/server/utils/requireRole';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  if (!session) throw apiError('E_AUTH', 'Сессия не инициализирована');
  if (process.env.NODE_ENV === 'production') {
    requireRole(session?.role, 'admin');
  }
  const query = QuestionCatalogListQueryDto.parse(getQuery(event));
  const response = await createQuestionCatalogService().list({
    anonymousSessionId: session.id,
    userId: session.userId ?? null,
    isAdmin: session.role === 'admin',
    query,
  });
  return AdminQuestionBankListResponseDto.parse(response);
});
