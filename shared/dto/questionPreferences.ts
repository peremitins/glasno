import { z } from 'zod';
import { InterviewFocusDto, InterviewLevelDto } from './interview';

const normalizedTagList = z
  .array(z.string().trim().min(1).max(80))
  .max(8)
  .transform((items) => [
    ...new Set(items.map((item) => item.toLowerCase()).filter(Boolean)),
  ]);

export const QuestionPreferenceStatusDto = z.enum([
  'repeat',
  'mastered',
  'hidden',
]);

export const QuestionSemanticPassportDto = z.object({
  conceptKey: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .transform((value) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]+/giu, '_')
        .replace(/^_+|_+$/g, '')
    ),
  conceptLabel: z.string().trim().min(2).max(240),
  topicTags: normalizedTagList,
  requiredContextTags: normalizedTagList,
  focus: InterviewFocusDto.nullable().default(null),
});

export const QuestionPreferenceSummaryDto = z.object({
  id: z.string(),
  status: QuestionPreferenceStatusDto,
});

export const SetTurnQuestionPreferenceRequestDto = z.object({
  turnId: z.string().trim().min(1),
  status: QuestionPreferenceStatusDto,
});

export const SetBankQuestionPreferenceRequestDto = z.object({
  questionId: z.string().trim().min(1),
  status: QuestionPreferenceStatusDto,
});

export const UpdateQuestionPreferenceRequestDto = z.object({
  status: QuestionPreferenceStatusDto,
});

export const QuestionPreferenceDto = z.object({
  id: z.string(),
  status: QuestionPreferenceStatusDto,
  question: z.string(),
  semantic: QuestionSemanticPassportDto.nullable(),
  roleKey: z.string(),
  roleLabel: z.string(),
  level: InterviewLevelDto,
  contextTags: z.array(z.string()),
  focus: InterviewFocusDto.nullable(),
  lastPracticedAt: z.string().nullable(),
  practiceCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const QuestionPreferenceListResponseDto = z.object({
  items: z.array(QuestionPreferenceDto),
  counts: z.object({
    repeat: z.number().int().nonnegative(),
    mastered: z.number().int().nonnegative(),
    hidden: z.number().int().nonnegative(),
  }),
});

export const QuestionPreferenceListQueryDto = z.object({
  status: QuestionPreferenceStatusDto.optional(),
  q: z.string().trim().max(200).optional(),
  roleKey: z.string().trim().max(160).optional(),
});

export const DeleteQuestionPreferenceResponseDto = z.object({
  ok: z.literal(true),
});

export type QuestionPreferenceStatus = z.infer<
  typeof QuestionPreferenceStatusDto
>;
export type QuestionSemanticPassport = z.infer<
  typeof QuestionSemanticPassportDto
>;
export type QuestionPreferenceSummary = z.infer<
  typeof QuestionPreferenceSummaryDto
>;
export type QuestionPreference = z.infer<typeof QuestionPreferenceDto>;
export type QuestionPreferenceListResponse = z.infer<
  typeof QuestionPreferenceListResponseDto
>;
export type QuestionPreferenceListQuery = z.infer<
  typeof QuestionPreferenceListQueryDto
>;
export type SetTurnQuestionPreferenceRequest = z.infer<
  typeof SetTurnQuestionPreferenceRequestDto
>;
export type SetBankQuestionPreferenceRequest = z.infer<
  typeof SetBankQuestionPreferenceRequestDto
>;
export type UpdateQuestionPreferenceRequest = z.infer<
  typeof UpdateQuestionPreferenceRequestDto
>;
