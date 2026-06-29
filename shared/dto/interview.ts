import { z } from 'zod';

export const InterviewSourceTypeDto = z.enum(['hh_url', 'text', 'profession']);
export const InterviewLevelDto = z.enum(['junior', 'middle', 'senior']);
export const InterviewerModeDto = z.enum(['soft', 'neutral', 'strict']);
export const InterviewSessionStatusDto = z.enum(['created', 'running', 'done']);
export const InterviewTurnKindDto = z.enum(['main', 'clarification']);
export const InterviewLanguageDto = z.enum(['ru', 'en']);
export const InterviewSessionGoalDto = z.enum(['quick', 'standard', 'deep']);
export const InterviewQuestionSourceModeDto = z.enum(['jobai', 'mixed', 'custom']);
export const InterviewQuestionSourceDto = z.enum(['jobai', 'user']);
export const InterviewResponseModeDto = z.enum(['text', 'dictation', 'realtime']);
export const InterviewHintModeDto = z.enum(['off', 'on_request', 'realtime']);
export const InterviewPlanItemStatusDto = z.enum([
  'planned',
  'asked',
  'skipped',
]);
export const InterviewPlanItemPriorityDto = z.enum(['required', 'reserve']);
export const InterviewerAvatarIdDto = z.enum([
  'neutral-pro',
  'strict-lead',
  'warm-hr',
]);

export const InterviewSourceDto = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hh_url'),
    url: z.string().url(),
  }),
  z.object({
    type: z.literal('text'),
    text: z.string().trim().min(10).max(30_000),
    title: z.string().trim().max(200).optional(),
  }),
  z.object({
    type: z.literal('profession'),
    role: z.string().trim().min(2).max(160),
    specialization: z.string().trim().max(240).optional(),
  }),
]);

export const QuestionCountDto = z.union([
  z.literal(3),
  z.literal(6),
  z.literal(10),
]);

export const RealtimeSessionLimitsDto = z.object({
  targetMinutes: z.number().int().positive(),
  warningAtMinutes: z.number().int().positive(),
  softLimitMinutes: z.number().int().positive(),
  hardLimitMinutes: z.number().int().positive(),
});

export const QuestionHintPackDto = z.object({
  structure: z.string(),
  bullets: z.array(z.string()),
  terms: z.array(z.string()),
  avoid: z.array(z.string()),
  strongDirection: z.string(),
});

export const InterviewPlanItemDto = z.object({
  id: z.string(),
  index: z.number().int().positive(),
  source: InterviewQuestionSourceDto,
  question: z.string().nullable(),
  priority: InterviewPlanItemPriorityDto,
  status: InterviewPlanItemStatusDto,
  hintPack: QuestionHintPackDto.nullable(),
});

export const InterviewPlanDto = z.object({
  goal: InterviewSessionGoalDto,
  expectedDurationMinutes: z.number().int().positive(),
  items: z.array(InterviewPlanItemDto),
});

export const CreateInterviewSessionRequestDto = z.object({
  source: InterviewSourceDto,
  resumeText: z.string().trim().max(30_000).optional(),
  role: z.string().trim().max(160).optional(),
  level: InterviewLevelDto.default('middle'),
  questionCount: QuestionCountDto.optional(),
  sessionGoal: InterviewSessionGoalDto.default('quick'),
  questionSourceMode: InterviewQuestionSourceModeDto.optional(),
  customQuestionsText: z.string().trim().max(10_000).optional(),
  responseMode: InterviewResponseModeDto.default('text'),
  hintMode: InterviewHintModeDto.default('off'),
  language: InterviewLanguageDto.default('ru'),
  interviewerMode: InterviewerModeDto.default('neutral'),
  interviewerAvatarId: InterviewerAvatarIdDto.default('neutral-pro'),
});

export const InterviewSessionDto = z.object({
  id: z.string(),
  status: InterviewSessionStatusDto,
  source: InterviewSourceTypeDto,
  vacancyTitle: z.string().nullable(),
  vacancyUrl: z.string().nullable(),
  companyName: z.string().nullable(),
  role: z.string().nullable(),
  level: InterviewLevelDto.nullable(),
  questionCount: z.number().int().positive(),
  sessionGoal: InterviewSessionGoalDto,
  expectedDurationMinutes: z.number().int().positive(),
  questionSourceMode: InterviewQuestionSourceModeDto,
  responseMode: InterviewResponseModeDto,
  hintMode: InterviewHintModeDto,
  realtimeLimits: RealtimeSessionLimitsDto,
  plan: InterviewPlanDto,
  language: InterviewLanguageDto,
  interviewerMode: InterviewerModeDto,
  interviewerAvatarId: InterviewerAvatarIdDto,
  currentQuestionIndex: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
  createdAt: z.string(),
});

export const InterviewTurnDto = z.object({
  id: z.string(),
  sessionId: z.string(),
  index: z.number().int().positive(),
  kind: InterviewTurnKindDto,
  question: z.string(),
  questionSource: InterviewQuestionSourceDto.default('jobai'),
  planItemId: z.string().nullable(),
  hintPack: QuestionHintPackDto.nullable(),
  answerTranscript: z.string().nullable(),
  followUpForTurnId: z.string().nullable(),
  answeredAt: z.string().nullable(),
  createdAt: z.string(),
});

export const InterviewStateResponseDto = z.object({
  session: InterviewSessionDto,
  turns: z.array(InterviewTurnDto),
  currentTurn: InterviewTurnDto.nullable(),
});

export const AnswerInterviewTurnRequestDto = z.object({
  turnId: z.string().min(1),
  answer: z.string().trim().min(2).max(20_000),
});

export const ResumeExtractResponseDto = z.object({
  text: z.string(),
  fileName: z.string().nullable(),
  mimeType: z.string().nullable(),
});

export type InterviewSourceType = z.infer<typeof InterviewSourceTypeDto>;
export type InterviewLevel = z.infer<typeof InterviewLevelDto>;
export type InterviewerMode = z.infer<typeof InterviewerModeDto>;
export type InterviewerAvatarId = z.infer<typeof InterviewerAvatarIdDto>;
export type InterviewSessionStatus = z.infer<typeof InterviewSessionStatusDto>;
export type InterviewTurnKind = z.infer<typeof InterviewTurnKindDto>;
export type InterviewLanguage = z.infer<typeof InterviewLanguageDto>;
export type InterviewSessionGoal = z.infer<typeof InterviewSessionGoalDto>;
export type InterviewQuestionSourceMode = z.infer<
  typeof InterviewQuestionSourceModeDto
>;
export type InterviewQuestionSource = z.infer<typeof InterviewQuestionSourceDto>;
export type InterviewResponseMode = z.infer<typeof InterviewResponseModeDto>;
export type InterviewHintMode = z.infer<typeof InterviewHintModeDto>;
export type RealtimeSessionLimits = z.infer<typeof RealtimeSessionLimitsDto>;
export type QuestionHintPack = z.infer<typeof QuestionHintPackDto>;
export type InterviewPlanItem = z.infer<typeof InterviewPlanItemDto>;
export type InterviewPlan = z.infer<typeof InterviewPlanDto>;
export type InterviewSource = z.infer<typeof InterviewSourceDto>;
export type CreateInterviewSessionRequest = z.infer<
  typeof CreateInterviewSessionRequestDto
>;
export type CreateInterviewSessionRequestInput = z.input<
  typeof CreateInterviewSessionRequestDto
>;
export type AnswerInterviewTurnRequest = z.infer<
  typeof AnswerInterviewTurnRequestDto
>;
export type InterviewSession = z.infer<typeof InterviewSessionDto>;
export type InterviewTurn = z.infer<typeof InterviewTurnDto>;
export type InterviewStateResponse = z.infer<typeof InterviewStateResponseDto>;
export type ResumeExtractResponse = z.infer<typeof ResumeExtractResponseDto>;
