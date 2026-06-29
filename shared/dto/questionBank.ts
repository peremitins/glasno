import { z } from 'zod';

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

