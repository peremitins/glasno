import { z } from 'zod';

export const InterviewSourceTypeDto = z.enum(['hh_url', 'text', 'profession']);
export const InterviewLevelDto = z.enum(['junior', 'middle', 'senior']);
export const InterviewerModeDto = z.enum(['soft', 'neutral', 'strict']);
// Тип/фокус сессии — что именно тренируем. Не выбор профессии (её даёт
// вакансия/роль), а формат вопросов внутри интервью. Используется быстрыми
// сценариями на дашборде и параметром на странице создания интервью.
export const InterviewFocusDto = z.enum([
  'hr_screening',
  'professional',
  'behavioral',
  'salary_negotiation',
]);
export const InterviewSessionStatusDto = z.enum(['created', 'running', 'done']);
export const InterviewTurnKindDto = z.enum(['main', 'clarification']);
export const InterviewLanguageDto = z.enum(['ru', 'en']);
export const InterviewSessionGoalDto = z.enum(['quick', 'standard', 'deep']);
export const InterviewQuestionSourceModeDto = z.enum(['glasno', 'mixed', 'custom']);
export const InterviewQuestionSourceDto = z.enum(['glasno', 'user']);
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

// Лицо (внешность) интервьюера для фото-аватара. Кодирует пол + тон:
// <gender>-<mode>. Тон части совпадает с InterviewerMode и определяет
// поведение ИИ — внешность и тон меняются вместе (в кабинете интервью).
export const InterviewerFaceIdDto = z.enum([
  'male-soft',
  'male-neutral',
  'male-strict',
  'female-soft',
  'female-neutral',
  'female-strict',
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

export const QuestionHintDetailsDto = z.object({
  focus: z.string(),
  answerPlan: z.array(z.string()),
  keyDefinitions: z.array(z.string()),
  sampleAnswerQuestion: z.string().trim().max(800).optional(),
  sampleAnswer: z.string(),
});

export const QuestionHintPackDto = z.object({
  structure: z.string(),
  bullets: z.array(z.string()),
  terms: z.array(z.string()),
  avoid: z.array(z.string()),
  strongDirection: z.string(),
  detailed: QuestionHintDetailsDto.optional(),
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
  resumeText: z.string().trim().max(15_000).optional(),
  role: z.string().trim().max(160).optional(),
  level: InterviewLevelDto.default('middle'),
  questionCount: QuestionCountDto.optional(),
  sessionGoal: InterviewSessionGoalDto.default('standard'),
  questionSourceMode: InterviewQuestionSourceModeDto.optional(),
  customQuestionsText: z.string().trim().max(10_000).optional(),
  focus: InterviewFocusDto.optional(),
  responseMode: InterviewResponseModeDto.default('text'),
  hintMode: InterviewHintModeDto.default('off'),
  language: InterviewLanguageDto.default('ru'),
  interviewerMode: InterviewerModeDto.default('neutral'),
  interviewerAvatarId: InterviewerAvatarIdDto.default('neutral-pro'),
  interviewerFaceId: InterviewerFaceIdDto.optional(),
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
  focus: InterviewFocusDto.nullable().default(null),
  responseMode: InterviewResponseModeDto,
  hintMode: InterviewHintModeDto,
  realtimeLimits: RealtimeSessionLimitsDto,
  plan: InterviewPlanDto,
  language: InterviewLanguageDto,
  interviewerMode: InterviewerModeDto,
  interviewerAvatarId: InterviewerAvatarIdDto,
  interviewerFaceId: InterviewerFaceIdDto.default('male-neutral'),
  currentQuestionIndex: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
  createdAt: z.string(),
});

// Реплика диалога внутри одного вопроса (живое общение «вопрос ↔ ответ»).
export const InterviewDialogueRoleDto = z.enum(['user', 'interviewer']);
export const InterviewDialogueMessageDto = z.object({
  role: InterviewDialogueRoleDto,
  content: z.string(),
  at: z.string(),
});

export const InterviewTurnDto = z.object({
  id: z.string(),
  sessionId: z.string(),
  index: z.number().int().positive(),
  kind: InterviewTurnKindDto,
  question: z.string(),
  questionSource: InterviewQuestionSourceDto.default('glasno'),
  planItemId: z.string().nullable(),
  hintPack: QuestionHintPackDto.nullable(),
  answerTranscript: z.string().nullable(),
  followUpForTurnId: z.string().nullable(),
  answeredAt: z.string().nullable(),
  createdAt: z.string(),
  // Диалог по этому вопросу: реплики кандидата и интервьюера.
  messages: z.array(InterviewDialogueMessageDto).default([]),
  // ИИ-интервьюер предлагает перейти к следующему вопросу.
  suggestMoveOn: z.boolean().default(false),
});

export const InterviewStateResponseDto = z.object({
  session: InterviewSessionDto,
  turns: z.array(InterviewTurnDto),
  currentTurn: InterviewTurnDto.nullable(),
});

export const DeleteInterviewSessionResponseDto = z.object({
  ok: z.literal(true),
});

// Чанк SSE-стрима ответа интервьюера (текстовый режим, постепенное появление).
// output_text_delta — очередной фрагмент текста; done+state — финальное
// состояние интервью после сохранения диалога; error — ошибка стрима.
export const InterviewReplyStreamChunkDto = z.object({
  output_text_delta: z.string().optional(),
  done: z.boolean().optional(),
  state: InterviewStateResponseDto.optional(),
  error: z
    .object({ code: z.string(), message: z.string() })
    .optional(),
});

export const AnswerInterviewTurnRequestDto = z.object({
  turnId: z.string().min(1),
  answer: z.string().trim().min(2).max(20_000),
});

// Реплика кандидата в диалоге по текущему вопросу (без перехода дальше).
export const ReplyInterviewTurnRequestDto = z.object({
  turnId: z.string().min(1),
  message: z.string().trim().min(1).max(20_000),
});

// Сохранение фактической realtime-реплики без генерации нового ответа ИИ.
export const AppendInterviewTurnMessageRequestDto = z.object({
  turnId: z.string().min(1),
  role: InterviewDialogueRoleDto,
  content: z.string().trim().min(1).max(20_000),
});

// Явный переход к следующему вопросу (кнопка / голосовая команда).
export const NextInterviewQuestionRequestDto = z.object({
  turnId: z.string().min(1),
});

export const GenerateInterviewHintsRequestDto = z.object({
  turnId: z.string().min(1),
});

// Смена интервьюера в кабинете: выбор лица меняет и внешность, и тон ИИ.
export const UpdateInterviewerRequestDto = z.object({
  faceId: InterviewerFaceIdDto,
});

export const ResumeExtractResponseDto = z.object({
  text: z.string(),
  fileName: z.string().nullable(),
  mimeType: z.string().nullable(),
});

export const QuestionInputExtractResponseDto = z.object({
  text: z.string(),
  fileName: z.string().nullable(),
  mimeType: z.string().nullable(),
});

export type InterviewSourceType = z.infer<typeof InterviewSourceTypeDto>;
export type InterviewLevel = z.infer<typeof InterviewLevelDto>;
export type InterviewerMode = z.infer<typeof InterviewerModeDto>;
export type InterviewFocus = z.infer<typeof InterviewFocusDto>;
export type InterviewerAvatarId = z.infer<typeof InterviewerAvatarIdDto>;
export type InterviewerFaceId = z.infer<typeof InterviewerFaceIdDto>;
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
export type InterviewDialogueRole = z.infer<typeof InterviewDialogueRoleDto>;
export type RealtimeSessionLimits = z.infer<typeof RealtimeSessionLimitsDto>;
export type QuestionHintDetails = z.infer<typeof QuestionHintDetailsDto>;
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
export type ReplyInterviewTurnRequest = z.infer<
  typeof ReplyInterviewTurnRequestDto
>;
export type AppendInterviewTurnMessageRequest = z.infer<
  typeof AppendInterviewTurnMessageRequestDto
>;
export type NextInterviewQuestionRequest = z.infer<
  typeof NextInterviewQuestionRequestDto
>;
export type GenerateInterviewHintsRequest = z.infer<
  typeof GenerateInterviewHintsRequestDto
>;
export type UpdateInterviewerRequest = z.infer<
  typeof UpdateInterviewerRequestDto
>;
export type InterviewDialogueMessage = z.infer<
  typeof InterviewDialogueMessageDto
>;
export type InterviewReplyStreamChunk = z.infer<
  typeof InterviewReplyStreamChunkDto
>;
export type InterviewSession = z.infer<typeof InterviewSessionDto>;
export type InterviewTurn = z.infer<typeof InterviewTurnDto>;
export type InterviewStateResponse = z.infer<typeof InterviewStateResponseDto>;
export type DeleteInterviewSessionResponse = z.infer<
  typeof DeleteInterviewSessionResponseDto
>;
export type ResumeExtractResponse = z.infer<typeof ResumeExtractResponseDto>;
export type QuestionInputExtractResponse = z.infer<
  typeof QuestionInputExtractResponseDto
>;
