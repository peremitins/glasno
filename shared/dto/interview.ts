import { z } from 'zod';
import { hasValidCustomInterviewQuestion } from '../interviewQuestion';
import {
  isSupportedVacancyUrl,
  UNSUPPORTED_VACANCY_URL_MESSAGE,
} from '../vacancyUrl';

export const InterviewSourceTypeDto = z.enum(['hh_url', 'text', 'profession']);
export const InterviewTrainingModeDto = z.enum(['candidate', 'interviewer']);
export const InterviewLevelDto = z.enum(['junior', 'middle', 'senior']);
export const InterviewerModeDto = z.enum(['soft', 'neutral', 'strict']);
export const CandidatePersonaDto = z.enum([
  'strong_brief',
  'verbose_vague',
  'anxious',
  'overconfident',
  'weak_hard_good_soft',
]);
export const CandidateDifficultyDto = z.enum([
  'calm',
  'realistic',
  'challenging',
]);
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
export const InterviewQuestionSourceModeDto = z.enum([
  'glasno',
  'mixed',
  'custom',
  'free',
]);
export const InterviewQuestionSourceDto = z.enum(['glasno', 'user', 'repeat']);
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
    url: z
      .string()
      .url()
      .refine(isSupportedVacancyUrl, {
        message: UNSUPPORTED_VACANCY_URL_MESSAGE,
      }),
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

export const QuestionPacingDto = z.object({
  firstReminderAfterMinutes: z.number().int().positive(),
  reminderCooldownMinutes: z.number().int().positive(),
});

const HintExampleContextDto = z.string().trim().max(1_200);
const HintExampleTextDto = z.string().trim().min(1).max(700);
const InterviewerQuestionTextDto = z.string().trim().min(3).max(500);

function isDirectInterviewerQuestion(value: string): boolean {
  const text = value.trim();
  return (
    text.endsWith('?') &&
    !/(?:^|[\s.!?])(?:я|мы)(?=$|[\s,.!?;:])/iu.test(text)
  );
}

const InterviewHintExampleBaseDto = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('candidate_answer'),
    context: HintExampleContextDto,
    text: HintExampleTextDto,
  }),
  z.object({
    kind: z.literal('interviewer_question'),
    context: HintExampleContextDto,
    text: InterviewerQuestionTextDto,
    followUps: z.array(InterviewerQuestionTextDto).max(2),
  }),
]);

export const InterviewHintExampleDto = InterviewHintExampleBaseDto.superRefine(
  (value, context) => {
    if (value.kind !== 'interviewer_question') return;
    if (!isDirectInterviewerQuestion(value.text)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['text'],
        message: 'Пример интервьюера должен быть прямым вопросом',
      });
    }
    for (const [index, question] of value.followUps.entries()) {
      if (isDirectInterviewerQuestion(question)) continue;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['followUps', index],
        message: 'Уточнение должно быть прямым вопросом',
      });
    }
  }
);

export const QuestionHintDetailsDto = z
  .object({
    focus: z.string(),
    answerPlan: z.array(z.string()),
    keyDefinitions: z.array(z.string()),
    example: InterviewHintExampleDto.optional(),
    // Старый формат остаётся только для чтения завершённых/старых сессий.
    sampleAnswerQuestion: z.string().trim().max(800).optional(),
    sampleAnswer: z.string().trim().min(1).max(700).optional(),
  })
  .superRefine((value, context) => {
    if (value.example || value.sampleAnswer) return;
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['example'],
      message: 'Нужен пример ответа или вопроса',
    });
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
  canonicalQuestionId: z.string().nullable().optional(),
  preferenceId: z.string().nullable().optional(),
  semantic: z.lazy(() =>
    z
      .object({
        conceptKey: z.string(),
        conceptLabel: z.string(),
        topicTags: z.array(z.string()),
        requiredContextTags: z.array(z.string()),
        focus: InterviewFocusDto.nullable(),
      })
      .nullable()
      .optional()
  ),
});

export const InterviewPlanDto = z.object({
  goal: InterviewSessionGoalDto,
  expectedDurationMinutes: z.number().int().positive(),
  items: z.array(InterviewPlanItemDto),
});

export const CreateInterviewSessionRequestDto = z
  .object({
    trainingMode: InterviewTrainingModeDto.default('candidate'),
    source: InterviewSourceDto,
    resumeText: z.string().trim().max(15_000).optional(),
    candidatePersona: CandidatePersonaDto.default('strong_brief'),
    candidateDifficulty: CandidateDifficultyDto.default('realistic'),
    candidateNotes: z.string().trim().max(4_000).optional(),
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
  })
  .superRefine((value, context) => {
    if (
      value.questionSourceMode === 'free' &&
      value.trainingMode !== 'interviewer'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['questionSourceMode'],
        message: 'Свободный сценарий доступен только интервьюеру',
      });
    }
    if (
      value.questionSourceMode === 'custom' &&
      !hasValidCustomInterviewQuestion(value.customQuestionsText)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customQuestionsText'],
        message:
          'Добавьте хотя бы один пользовательский вопрос не короче 8 символов',
      });
    }
  });

export const InterviewSessionDto = z.object({
  id: z.string(),
  status: InterviewSessionStatusDto,
  trainingMode: InterviewTrainingModeDto.default('candidate'),
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
  questionPacing: QuestionPacingDto,
  plan: InterviewPlanDto,
  language: InterviewLanguageDto,
  interviewerMode: InterviewerModeDto,
  interviewerAvatarId: InterviewerAvatarIdDto,
  interviewerFaceId: InterviewerFaceIdDto.default('male-neutral'),
  candidatePersona: CandidatePersonaDto.default('strong_brief'),
  candidateDifficulty: CandidateDifficultyDto.default('realistic'),
  candidateNotes: z.string().nullable().default(null),
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
  // Таймбокс начинается с первой реплики пользователя по вопросу.
  questionPacingStartedAt: z.string().nullable().default(null),
  questionPacingLastReminderAt: z.string().nullable().default(null),
  preference: z
    .object({
      id: z.string(),
      status: z.enum(['repeat', 'mastered', 'hidden']),
    })
    .nullable()
    .default(null),
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
  timeboxReminder: z.boolean().optional(),
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
export type InterviewTrainingMode = z.infer<typeof InterviewTrainingModeDto>;
export type InterviewLevel = z.infer<typeof InterviewLevelDto>;
export type InterviewerMode = z.infer<typeof InterviewerModeDto>;
export type CandidatePersona = z.infer<typeof CandidatePersonaDto>;
export type CandidateDifficulty = z.infer<typeof CandidateDifficultyDto>;
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
export type InterviewHintExample = z.infer<typeof InterviewHintExampleDto>;
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
