import type {
  CreateInterviewSessionRequest,
  InterviewFocus,
  InterviewSessionGoal,
  InterviewerFaceId,
  InterviewHintMode,
  InterviewPlan,
  InterviewPlanItem,
  InterviewQuestionSource,
  InterviewQuestionSourceMode,
  QuestionHintPack,
  RealtimeSessionLimits,
} from '@/shared/dto';
import type { InterviewTurnRecord } from '@/server/interface/interviewRepository';
import {
  defaultFaceForMode,
  isInterviewerFaceId,
} from '@/server/application/interview/interviewerFace';

export interface InterviewSessionMetadata {
  sessionGoal: InterviewSessionGoal;
  expectedDurationMinutes: number;
  questionSourceMode: InterviewQuestionSourceMode;
  responseMode: 'text' | 'dictation' | 'realtime';
  hintMode: InterviewHintMode;
  realtimeLimits: RealtimeSessionLimits;
  interviewerFaceId: InterviewerFaceId;
  // Тип/фокус сессии (HR-скрининг, профессиональное, поведенческое,
  // зарплатные переговоры). null — фокус не задан, движок выбирает вопросы
  // без смещения в сторону конкретного формата.
  focus: InterviewFocus | null;
  plan: InterviewPlan;
}

export interface PlannedQuestion {
  planItemId: string;
  source: InterviewQuestionSource;
  question: string;
  hintPack: QuestionHintPack;
}

const SESSION_GOAL_CONFIG: Record<
  InterviewSessionGoal,
  {
    expectedDurationMinutes: number;
    targetQuestionCount: number;
    warningAtMinutes: number;
    softLimitMinutes: number;
    hardLimitMinutes: number;
  }
> = {
  quick: {
    expectedDurationMinutes: 7,
    targetQuestionCount: 3,
    warningAtMinutes: 6,
    softLimitMinutes: 7,
    hardLimitMinutes: 10,
  },
  standard: {
    expectedDurationMinutes: 15,
    targetQuestionCount: 6,
    warningAtMinutes: 13,
    softLimitMinutes: 15,
    hardLimitMinutes: 20,
  },
  deep: {
    expectedDurationMinutes: 25,
    targetQuestionCount: 10,
    warningAtMinutes: 22,
    softLimitMinutes: 25,
    hardLimitMinutes: 32,
  },
};

export function getSessionGoalConfig(goal: InterviewSessionGoal) {
  return SESSION_GOAL_CONFIG[goal];
}

export function buildInterviewPlanMetadata(params: {
  input: CreateInterviewSessionRequest;
  role?: string | null;
  vacancyTitle?: string | null;
}): InterviewSessionMetadata {
  const sessionGoal = params.input.sessionGoal ?? goalFromLegacyQuestionCount(
    params.input.questionCount
  );
  const config = getSessionGoalConfig(sessionGoal);
  const questionSourceMode = params.input.questionSourceMode ?? (
    params.input.customQuestionsText?.trim() ? 'mixed' : 'glasno'
  );
  const customQuestions = normalizeCustomQuestions(
    params.input.customQuestionsText
  );

  const requiredUserItems = customQuestions
    .slice(0, config.targetQuestionCount)
    .map<InterviewPlanItem>((question, index) => ({
      id: `plan_user_${index + 1}`,
      index: index + 1,
      source: 'user',
      question,
      priority: 'required',
      status: 'planned',
      hintPack: buildHintPack({
        question,
        role: params.role,
        vacancyTitle: params.vacancyTitle,
      }),
    }));

  const remainingSlots = Math.max(
    0,
    config.targetQuestionCount - requiredUserItems.length
  );
  const glasnoItems =
    questionSourceMode === 'custom'
      ? []
      : Array.from({ length: remainingSlots }, (_, index) => {
          const planIndex = requiredUserItems.length + index + 1;
          return {
            id: `plan_glasno_${index + 1}`,
            index: planIndex,
            source: 'glasno' as const,
            question: null,
            priority: index === remainingSlots - 1 ? 'reserve' : 'required',
            status: 'planned' as const,
            hintPack: null,
          } satisfies InterviewPlanItem;
        });

  return {
    sessionGoal,
    expectedDurationMinutes: config.expectedDurationMinutes,
    questionSourceMode,
    responseMode: params.input.responseMode ?? 'text',
    hintMode: params.input.hintMode ?? 'off',
    realtimeLimits: {
      targetMinutes: config.expectedDurationMinutes,
      warningAtMinutes: config.warningAtMinutes,
      softLimitMinutes: config.softLimitMinutes,
      hardLimitMinutes: config.hardLimitMinutes,
    },
    interviewerFaceId:
      params.input.interviewerFaceId ??
      defaultFaceForMode(params.input.interviewerMode ?? 'neutral'),
    focus: params.input.focus ?? null,
    plan: {
      goal: sessionGoal,
      expectedDurationMinutes: config.expectedDurationMinutes,
      items: [...requiredUserItems, ...glasnoItems],
    },
  };
}

export function parseInterviewSessionMetadata(
  value: unknown
): InterviewSessionMetadata {
  if (!value || typeof value !== 'object') {
    return buildInterviewPlanMetadata({
      input: {
        source: { type: 'profession', role: 'Кандидат' },
        level: 'middle',
        sessionGoal: 'quick',
        questionSourceMode: 'glasno',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
        interviewerFaceId: 'male-neutral',
      },
    });
  }

  const raw = value as Partial<InterviewSessionMetadata>;
  const sessionGoal = isSessionGoal(raw.sessionGoal) ? raw.sessionGoal : 'quick';
  const config = getSessionGoalConfig(sessionGoal);
  const plan =
    raw.plan && Array.isArray(raw.plan.items)
      ? raw.plan
      : {
          goal: sessionGoal,
          expectedDurationMinutes: config.expectedDurationMinutes,
          items: [],
        };

  return {
    sessionGoal,
    expectedDurationMinutes:
      numberOrNull(raw.expectedDurationMinutes) ?? config.expectedDurationMinutes,
    questionSourceMode: isQuestionSourceMode(raw.questionSourceMode)
      ? raw.questionSourceMode
      : 'glasno',
    responseMode:
      raw.responseMode === 'dictation' || raw.responseMode === 'realtime'
        ? raw.responseMode
        : 'text',
    hintMode: isHintMode(raw.hintMode) ? raw.hintMode : 'off',
    realtimeLimits: normalizeRealtimeLimits(raw.realtimeLimits, config),
    interviewerFaceId: isInterviewerFaceId(raw.interviewerFaceId)
      ? raw.interviewerFaceId
      : defaultFaceForMode('neutral'),
    focus: isInterviewFocus(raw.focus) ? raw.focus : null,
    plan,
  };
}

export function resolveNextPlannedQuestion(params: {
  metadata: InterviewSessionMetadata;
  turns: Array<Pick<InterviewTurnRecord, 'kind' | 'metadata'>>;
}): PlannedQuestion | null {
  const askedPlanItemIds = new Set(
    params.turns
      .filter((turn) => turn.kind === 'main')
      .map((turn) => extractPlanItemId(turn.metadata))
      .filter((id): id is string => Boolean(id))
  );
  const nextUserItem = params.metadata.plan.items.find(
    (item) =>
      item.source === 'user' &&
      item.question &&
      !askedPlanItemIds.has(item.id)
  );

  if (nextUserItem?.question) {
    return {
      planItemId: nextUserItem.id,
      source: 'user',
      question: nextUserItem.question,
      hintPack:
        nextUserItem.hintPack ??
        buildHintPack({ question: nextUserItem.question }),
    };
  }

  if (params.metadata.questionSourceMode === 'custom') {
    return null;
  }

  const nextGlasnoItem = params.metadata.plan.items.find(
    (item) => item.source === 'glasno' && !askedPlanItemIds.has(item.id)
  );

  if (!nextGlasnoItem) return null;

  return {
    planItemId: nextGlasnoItem.id,
    source: 'glasno',
    question: '',
    hintPack: buildHintPack({ question: '' }),
  };
}

export function buildHintPack(params: {
  question: string;
  role?: string | null;
  vacancyTitle?: string | null;
}): QuestionHintPack {
  const question = normalizeQuestionText(params.question || 'текущий вопрос');
  const roleContext = params.vacancyTitle || params.role || 'выбранной роли';
  return {
    structure:
      'Отвечайте по шагам: ситуация → ваша задача → конкретные действия → измеримый результат.',
    bullets: [
      `Свяжите ответ с контекстом ${roleContext}.`,
      'Добавьте конкретный пример, а не общую оценку.',
      'Назовите результат: число, срок, масштаб или вывод.',
      'Закончите ответ тем, чему научились или как примените опыт дальше.',
    ],
    terms: [roleContext, 'результат', 'конкретика'],
    avoid: [
      'Не уходите в длинную предысторию без результата.',
      'Не отвечайте только «мы сделали» — выделите личный вклад.',
      'Не заменяйте пример общими качествами вроде «ответственный».',
    ],
    strongDirection: `Раскройте вопрос «${question}» через один конкретный кейс, где видны ваш вклад и итог.`,
  };
}

function normalizeCustomQuestions(value?: string | null): string[] {
  const raw = value?.trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const candidates = raw
    .split(/\n|;|(?<=\?)\s+/)
    .map((item) => normalizeQuestionText(item))
    .filter((item) => item.length >= 8);

  const result: string[] = [];
  for (const question of candidates) {
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(question);
  }
  return result.slice(0, 12);
}

function normalizeQuestionText(value: string): string {
  const normalized = value
    .trim()
    .replace(/^\d+[).:-]\s*/, '')
    .replace(/\s+/g, ' ');
  if (!normalized) return '';
  return /[?.!]$/.test(normalized) ? normalized : `${normalized}?`;
}

function goalFromLegacyQuestionCount(
  count?: CreateInterviewSessionRequest['questionCount']
): InterviewSessionGoal {
  if (count === 10) return 'deep';
  if (count === 6) return 'standard';
  return 'quick';
}

function extractPlanItemId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as { planItemId?: unknown }).planItemId;
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeRealtimeLimits(
  value: unknown,
  config: ReturnType<typeof getSessionGoalConfig>
): RealtimeSessionLimits {
  if (!value || typeof value !== 'object') {
    return {
      targetMinutes: config.expectedDurationMinutes,
      warningAtMinutes: config.warningAtMinutes,
      softLimitMinutes: config.softLimitMinutes,
      hardLimitMinutes: config.hardLimitMinutes,
    };
  }
  const raw = value as Partial<RealtimeSessionLimits>;
  return {
    targetMinutes: numberOrNull(raw.targetMinutes) ?? config.expectedDurationMinutes,
    warningAtMinutes: numberOrNull(raw.warningAtMinutes) ?? config.warningAtMinutes,
    softLimitMinutes: numberOrNull(raw.softLimitMinutes) ?? config.softLimitMinutes,
    hardLimitMinutes: numberOrNull(raw.hardLimitMinutes) ?? config.hardLimitMinutes,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isSessionGoal(value: unknown): value is InterviewSessionGoal {
  return value === 'quick' || value === 'standard' || value === 'deep';
}

function isQuestionSourceMode(value: unknown): value is InterviewQuestionSourceMode {
  return value === 'glasno' || value === 'mixed' || value === 'custom';
}

function isHintMode(value: unknown): value is InterviewHintMode {
  return value === 'off' || value === 'on_request' || value === 'realtime';
}

function isInterviewFocus(value: unknown): value is InterviewFocus {
  return (
    value === 'hr_screening' ||
    value === 'professional' ||
    value === 'behavioral' ||
    value === 'salary_negotiation'
  );
}
