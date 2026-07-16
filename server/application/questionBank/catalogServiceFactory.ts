import { AdminQuestionBankService } from './adminQuestionBankService';
import { QuestionCatalogService } from './questionCatalogService';
import { DrizzleAdminQuestionBankRepository } from '@/server/infrastructure/questionBank/drizzleAdminQuestionBankRepository';
import { DrizzleQuestionPreferenceRepository } from '@/server/infrastructure/questionPreferences/drizzleQuestionPreferenceRepository';

export function createQuestionCatalogService() {
  return new QuestionCatalogService({
    questionBankService: new AdminQuestionBankService({
      repository: new DrizzleAdminQuestionBankRepository(),
    }),
    preferenceRepository: new DrizzleQuestionPreferenceRepository(),
  });
}
