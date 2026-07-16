import { z } from 'zod';
import { QuestionPreferenceStatusDto, QuestionPreferenceSummaryDto } from './questionPreferences';

export const QuestionBankTypeDto = z.enum([
  'hr',
  'behavioral',
  'professional',
  'stress',
]);

export const QuestionDifficultyDto = z.enum(['junior', 'middle', 'senior']);

export const QuestionBankListQueryDto = z.object({
  domain: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  type: QuestionBankTypeDto.optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

export const QuestionBankItemDto = z.object({
  id: z.string(),
  slug: z.string(),
  domain: z.string(),
  domainLabel: z.string(),
  role: z.string().nullable(),
  type: QuestionBankTypeDto,
  typeLabel: z.string(),
  difficulty: QuestionDifficultyDto,
  question: z.string(),
  strongAnswer: z.string().nullable(),
  commonMistakes: z.string().nullable(),
  isPublic: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

export const QuestionBankFacetsDto = z.object({
  domains: z.array(z.string()),
  roles: z.array(z.string()),
  types: z.array(QuestionBankTypeDto),
});

export const QuestionBankListResponseDto = z.object({
  items: z.array(QuestionBankItemDto),
  facets: QuestionBankFacetsDto,
});

export const QuestionBankItemResponseDto = z.object({
  item: QuestionBankItemDto,
  related: z.array(QuestionBankItemDto),
});

export type QuestionBankType = z.infer<typeof QuestionBankTypeDto>;
export type QuestionDifficulty = z.infer<typeof QuestionDifficultyDto>;
export type QuestionBankListQuery = z.infer<typeof QuestionBankListQueryDto>;
export type QuestionBankItem = z.infer<typeof QuestionBankItemDto>;
export type QuestionBankFacets = z.infer<typeof QuestionBankFacetsDto>;
export type QuestionBankListResponse = z.infer<
  typeof QuestionBankListResponseDto
>;
export type QuestionBankItemResponse = z.infer<
  typeof QuestionBankItemResponseDto
>;

export const QuestionBankFrameworkDto = z.enum([
  'none',
  'react',
  'vue',
  'angular',
]);
export const QuestionBankInterviewTypeDto = z.enum([
  'technical',
  'behavioral',
  'live_coding',
  'system_design',
]);
export const QuestionBankSeniorityDto = z.enum([
  'junior',
  'middle',
  'senior',
]);
export const QuestionBankReviewStatusDto = z.enum([
  'pending',
  'passed',
  'rejected',
]);
export const QuestionBankContentStatusDto = z.enum([
  'review',
  'published',
  'deprecated',
]);
export const QuestionBankAnswerStateDto = z.enum(['with_answer', 'without_answer']);

export const QuestionBankAnswerSourceDto = z.object({
  sourceType: z.enum(['official_docs', 'standard']),
  name: z.string().min(1),
  url: z.string().url(),
});

export const AdminQuestionBankListQueryDto = z.object({
  q: z.string().trim().max(160).optional(),
  role: z.string().trim().max(120).optional(),
  framework: QuestionBankFrameworkDto.optional(),
  topic: z.string().trim().max(120).optional(),
  interviewType: QuestionBankInterviewTypeDto.optional(),
  seniority: QuestionBankSeniorityDto.optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  answerState: QuestionBankAnswerStateDto.optional(),
  technicalReview: QuestionBankReviewStatusDto.optional(),
  editorialReview: QuestionBankReviewStatusDto.optional(),
  status: QuestionBankContentStatusDto.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

export const QuestionCatalogListQueryDto = AdminQuestionBankListQueryDto.extend({
  preferenceStatus: QuestionPreferenceStatusDto.optional(),
});

export const QuestionBankProvenanceDto = z.object({
  sourceType: z.enum(['open_source', 'official_docs', 'original']),
  sourceName: z.string(),
  repositoryUrl: z.string().url().nullable(),
  sourceFilePath: z.string().nullable(),
  sourceCommitSha: z.string().nullable(),
  sourceUrl: z.string().url().nullable(),
  licenseSpdx: z.string().nullable(),
  attributionRequired: z.boolean(),
  importType: z.enum(['translated', 'adapted', 'original']),
  originalContentHash: z.string().nullable(),
  changesSummary: z.string().nullable(),
  importedAt: z.string(),
  answerSources: z.array(QuestionBankAnswerSourceDto).default([]),
  answerVerifiedAt: z.string().datetime().nullable().default(null),
});

export const AdminQuestionBankItemDto = z.object({
  id: z.string(),
  corpusId: z.string().nullable(),
  slug: z.string(),
  role: z.string(),
  framework: QuestionBankFrameworkDto,
  topic: z.string(),
  subtopic: z.string().nullable(),
  interviewType: QuestionBankInterviewTypeDto,
  seniority: QuestionBankSeniorityDto,
  difficulty: z.number().int().min(1).max(5),
  question: z.string(),
  variants: z.array(z.string()),
  answer: z.string().nullable(),
  answerFormat: z.enum(['plain', 'markdown']).nullable(),
  tags: z.array(z.string()),
  expectedConcepts: z.array(z.string()),
  status: QuestionBankContentStatusDto,
  technicalReview: QuestionBankReviewStatusDto,
  editorialReview: QuestionBankReviewStatusDto,
  isPublic: z.boolean(),
  provenance: QuestionBankProvenanceDto.nullable(),
  preference: QuestionPreferenceSummaryDto.nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

export const QuestionBankFacetDto = z.object({
  value: z.string(),
  count: z.number().int().nonnegative(),
});

export const AdminQuestionBankListResponseDto = z.object({
  items: z.array(AdminQuestionBankItemDto),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  summary: z.object({
    total: z.number().int().nonnegative(),
    withAnswers: z.number().int().nonnegative(),
    pendingTechnical: z.number().int().nonnegative(),
    published: z.number().int().nonnegative(),
  }),
  facets: z.object({
    roles: z.array(QuestionBankFacetDto),
    frameworks: z.array(QuestionBankFacetDto),
    topics: z.array(QuestionBankFacetDto),
    interviewTypes: z.array(QuestionBankFacetDto),
    seniorities: z.array(QuestionBankFacetDto),
    technicalReviews: z.array(QuestionBankFacetDto),
    editorialReviews: z.array(QuestionBankFacetDto),
    statuses: z.array(QuestionBankFacetDto),
  }),
});

export type QuestionBankFramework = z.infer<typeof QuestionBankFrameworkDto>;
export type QuestionBankInterviewType = z.infer<
  typeof QuestionBankInterviewTypeDto
>;
export type QuestionBankSeniority = z.infer<typeof QuestionBankSeniorityDto>;
export type QuestionBankReviewStatus = z.infer<
  typeof QuestionBankReviewStatusDto
>;
export type QuestionBankContentStatus = z.infer<
  typeof QuestionBankContentStatusDto
>;
export type AdminQuestionBankListQuery = z.infer<
  typeof AdminQuestionBankListQueryDto
>;
export type QuestionCatalogListQuery = z.infer<
  typeof QuestionCatalogListQueryDto
>;
export type AdminQuestionBankItem = z.infer<typeof AdminQuestionBankItemDto>;
export type AdminQuestionBankListResponse = z.infer<
  typeof AdminQuestionBankListResponseDto
>;
export type QuestionBankProvenance = z.infer<typeof QuestionBankProvenanceDto>;
