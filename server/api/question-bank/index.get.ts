import {
  QuestionBankListQueryDto,
  QuestionBankListResponseDto,
} from '@/shared/dto';
import { createQuestionBankService } from '@/server/application/questionBank/serviceFactory';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const filters = QuestionBankListQueryDto.parse(getQuery(event));
  const service = createQuestionBankService();
  const response = await service.listPublic(filters);
  return QuestionBankListResponseDto.parse(response);
});

