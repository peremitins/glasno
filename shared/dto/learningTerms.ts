import { z } from 'zod';

export const LearningTermContextKindDto = z.enum([
  'interview_question',
  'interview_message',
  'interview_hint',
  'report',
  'dashboard',
  'history',
  'question_bank',
  'generic',
]);

export const LearningTermContextDto = z.object({
  kind: LearningTermContextKindDto,
  interviewSessionId: z.string().trim().min(1).max(120).optional(),
  reportId: z.string().trim().min(1).max(120).optional(),
  turnId: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().max(160).optional(),
});

export const ExplainLearningTermRequestDto = z.object({
  term: z.string().trim().min(1).max(120),
  text: z.string().trim().min(2).max(2_000),
  shortDefinition: z.string().trim().max(180).optional(),
  context: LearningTermContextDto,
});

export const ExplainLearningTermResponseDto = z.object({
  term: z.string(),
  title: z.string(),
  shortDefinition: z.string(),
  explanation: z.string(),
});

export type LearningTermContextKind = z.infer<typeof LearningTermContextKindDto>;
export type LearningTermContext = z.infer<typeof LearningTermContextDto>;
export type ExplainLearningTermRequest = z.infer<
  typeof ExplainLearningTermRequestDto
>;
export type ExplainLearningTermResponse = z.infer<
  typeof ExplainLearningTermResponseDto
>;
