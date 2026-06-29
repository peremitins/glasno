import { QuestionBankService } from './questionBankService';
import { DrizzleQuestionBankRepository } from '@/server/infrastructure/questionBank/drizzleQuestionBankRepository';

export function createQuestionBankService(): QuestionBankService {
  return new QuestionBankService({
    repository: new DrizzleQuestionBankRepository(),
  });
}

