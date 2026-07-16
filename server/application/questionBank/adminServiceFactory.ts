import { DrizzleAdminQuestionBankRepository } from '@/server/infrastructure/questionBank/drizzleAdminQuestionBankRepository';
import { AdminQuestionBankService } from './adminQuestionBankService';

export function createAdminQuestionBankService() {
  return new AdminQuestionBankService({
    repository: new DrizzleAdminQuestionBankRepository(),
  });
}
