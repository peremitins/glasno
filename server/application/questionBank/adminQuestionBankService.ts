import type {
  AdminQuestionBankItem,
  AdminQuestionBankListQuery,
  AdminQuestionBankListResponse,
} from '@/shared/dto';
import type {
  AdminQuestionBankMetadataRecord,
  AdminQuestionBankRecord,
  AdminQuestionBankRepository,
} from '@/server/interface/adminQuestionBankRepository';
import type { QuestionPreferenceRecord } from '@/server/interface/questionPreferenceRepository';

export class AdminQuestionBankService {
  constructor(
    private readonly deps: { repository: AdminQuestionBankRepository }
  ) {}

  async list(
    query: AdminQuestionBankListQuery,
    options: {
      includeProvenance?: boolean;
      reviewedOnly?: boolean;
      conceptKeys?: string[];
      preferences?: QuestionPreferenceRecord[];
    } = {}
  ): Promise<AdminQuestionBankListResponse> {
    const [result, metadata] = await Promise.all([
      this.deps.repository.listAdmin(query, options),
      this.deps.repository.listAdminMetadata(options),
    ]);

    return {
      items: result.rows.map((row) => toItem(row, options)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      summary: {
        total: metadata.length,
        withAnswers: metadata.filter((item) => item.hasAnswer).length,
        pendingTechnical: metadata.filter(
          (item) => item.technicalReview === 'pending'
        ).length,
        published: metadata.filter((item) => item.status === 'published').length,
      },
      facets: {
        roles: facet(metadata, (item) => item.role),
        frameworks: facet(metadata, (item) => item.framework),
        topics: facet(metadata, (item) => item.topic),
        interviewTypes: facet(metadata, (item) => item.interviewType),
        seniorities: facet(metadata, (item) => item.seniority),
        technicalReviews: facet(metadata, (item) => item.technicalReview),
        editorialReviews: facet(metadata, (item) => item.editorialReview),
        statuses: facet(metadata, (item) => item.status),
      },
    };
  }
}

function toItem(
  row: AdminQuestionBankRecord,
  options: {
    includeProvenance?: boolean;
    preferences?: QuestionPreferenceRecord[];
  }
): AdminQuestionBankItem {
  const preference = options.preferences?.find(
    (item) => item.conceptKey === row.corpusId && item.level === row.seniority
  );
  return {
    id: row.id,
    corpusId: row.corpusId,
    slug: row.slug ?? row.corpusId ?? row.id,
    role: row.role ?? 'Frontend Developer',
    framework: row.framework,
    topic: row.topic ?? 'other',
    subtopic: row.subtopic,
    interviewType: row.interviewType,
    seniority: row.seniority,
    difficulty: row.difficultyLevel,
    question: row.question,
    variants: row.variants,
    answer: row.strongAnswer,
    answerFormat: row.answerFormat,
    tags: row.tags,
    expectedConcepts: row.expectedConcepts,
    status: row.status,
    technicalReview: row.technicalReview,
    editorialReview: row.editorialReview,
    isPublic: row.isPublic,
    provenance: options.includeProvenance === false ? null : row.provenance,
    preference: preference
      ? { id: preference.id, status: preference.status }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function facet(
  metadata: AdminQuestionBankMetadataRecord[],
  select: (item: AdminQuestionBankMetadataRecord) => string | null
) {
  const counts = new Map<string, number>();
  for (const item of metadata) {
    const value = select(item);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value, 'ru'));
}
