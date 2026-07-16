import type {
  AdminQuestionBankListResponse,
  QuestionCatalogListQuery,
} from '@/shared/dto';
import type {
  QuestionPreferenceOwner,
  QuestionPreferenceRepository,
} from '@/server/interface/questionPreferenceRepository';
import type { AdminQuestionBankService } from './adminQuestionBankService';

export class QuestionCatalogService {
  constructor(
    private readonly deps: {
      questionBankService: AdminQuestionBankService;
      preferenceRepository: QuestionPreferenceRepository;
    }
  ) {}

  async list(
    params: QuestionPreferenceOwner & {
      query: QuestionCatalogListQuery;
      isAdmin: boolean;
    }
  ): Promise<AdminQuestionBankListResponse> {
    const preferences = await this.deps.preferenceRepository.listForOwner({
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId ?? null,
    });
    const conceptKeys = params.query.preferenceStatus
      ? preferences
          .filter((item) => item.status === params.query.preferenceStatus)
          .map((item) => item.conceptKey)
      : undefined;
    const { preferenceStatus: _preferenceStatus, ...questionQuery } = params.query;

    return this.deps.questionBankService.list(questionQuery, {
      includeProvenance: params.isAdmin,
      reviewedOnly: !params.isAdmin,
      conceptKeys,
      preferences,
    });
  }
}
