import { createHash } from 'node:crypto';
import type {
  QuestionPreference,
  QuestionPreferenceListResponse,
  QuestionSemanticPassport,
  SetTurnQuestionPreferenceRequest,
  UpdateQuestionPreferenceRequest,
  InterviewFocus,
} from '@/shared/dto';
import { QuestionSemanticPassportDto } from '@/shared/dto';
import { buildQuestionContext } from '@/shared/questionContext';
import type { InterviewRepository } from '@/server/interface/interviewRepository';
import type {
  QuestionPreferenceListFilters,
  QuestionPreferenceOwner,
  QuestionPreferenceRecord,
  QuestionPreferenceRepository,
} from '@/server/interface/questionPreferenceRepository';
import { apiError } from '@/server/utils/errors';
import { assertOwnedInterviewSession } from '@/server/application/interview/sessionOwnership';

export class QuestionPreferenceService {
  constructor(
    private readonly deps: {
      repository: QuestionPreferenceRepository;
      interviewRepository: InterviewRepository;
    }
  ) {}

  async setForTurn(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: SetTurnQuestionPreferenceRequest;
  }): Promise<QuestionPreference> {
    const session = await this.deps.interviewRepository.findSessionById(
      params.sessionId
    );
    if (!session) throw apiError('E_NOT_FOUND', 'Интервью не найдено');
    assertOwnedInterviewSession(session, params);
    if (session.trainingMode !== 'candidate') {
      throw apiError(
        'E_VALIDATION',
        'Настройки вопросов доступны только в режиме кандидата'
      );
    }

    const turn = await this.deps.interviewRepository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    if (turn.kind !== 'main') {
      throw apiError(
        'E_VALIDATION',
        'Настройку можно сохранить только для основного вопроса'
      );
    }

    const semantic = readSemanticPassport(turn.metadata);
    const metadata = asRecord(session.metadata);
    const sessionContext = buildQuestionContext({
      role: session.role || session.vacancyTitle || 'Не указана',
      level: session.level || 'middle',
      vacancyText: session.vacancyRaw,
      focus: readFocus(metadata.focus),
    });
    const row = await this.deps.repository.upsert({
      ...ownerFrom(params),
      status: params.input.status,
      question: turn.question,
      conceptKey: semantic?.conceptKey ?? fallbackConceptKey(turn.question),
      semantic,
      roleKey: sessionContext.roleKey,
      roleLabel: sessionContext.roleLabel,
      level: sessionContext.level,
      contextTags:
        semantic?.requiredContextTags ?? sessionContext.contextTags,
      focus: semantic?.focus ?? sessionContext.focus,
      sourceSessionId: session.id,
      sourceTurnId: turn.id,
    });
    await this.deps.interviewRepository.updateTurnMetadata(
      session.id,
      turn.id,
      {
        ...asRecord(turn.metadata),
        preference: { id: row.id, status: row.status },
      }
    );

    return recordToDto(row);
  }

  async list(params: QuestionPreferenceOwner & {
    filters?: QuestionPreferenceListFilters;
  }): Promise<QuestionPreferenceListResponse> {
    const rows = await this.deps.repository.listForOwner(
      ownerFrom(params),
      params.filters
    );
    const allRows = params.filters?.status
      ? await this.deps.repository.listForOwner(ownerFrom(params), {
          ...params.filters,
          status: undefined,
        })
      : rows;
    return {
      items: rows.map(recordToDto),
      counts: {
        repeat: allRows.filter((row) => row.status === 'repeat').length,
        mastered: allRows.filter((row) => row.status === 'mastered').length,
        hidden: allRows.filter((row) => row.status === 'hidden').length,
      },
    };
  }

  async update(params: QuestionPreferenceOwner & {
    id: string;
    input: UpdateQuestionPreferenceRequest;
  }): Promise<QuestionPreference> {
    const row = await this.deps.repository.updateStatus(
      params.id,
      ownerFrom(params),
      params.input.status
    );
    if (!row) throw apiError('E_NOT_FOUND', 'Настройка вопроса не найдена');
    return recordToDto(row);
  }

  async delete(params: QuestionPreferenceOwner & { id: string }): Promise<{
    ok: true;
  }> {
    const deleted = await this.deps.repository.delete(
      params.id,
      ownerFrom(params)
    );
    if (!deleted) {
      throw apiError('E_NOT_FOUND', 'Настройка вопроса не найдена');
    }
    return { ok: true };
  }
}

function ownerFrom(params: QuestionPreferenceOwner): QuestionPreferenceOwner {
  return {
    anonymousSessionId: params.anonymousSessionId,
    userId: params.userId ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function readFocus(value: unknown): InterviewFocus | null {
  return value === 'hr_screening' ||
    value === 'professional' ||
    value === 'behavioral' ||
    value === 'salary_negotiation'
    ? value
    : null;
}

function readSemanticPassport(
  metadata: Record<string, unknown> | null
): QuestionSemanticPassport | null {
  const parsed = QuestionSemanticPassportDto.safeParse(
    asRecord(metadata).semantic
  );
  return parsed.success ? parsed.data : null;
}

function fallbackConceptKey(question: string): string {
  const normalized = question
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, ' ')
    .replace(/\s+/g, ' ');
  return `legacy_${createHash('sha256').update(normalized).digest('hex').slice(0, 24)}`;
}

function recordToDto(row: QuestionPreferenceRecord): QuestionPreference {
  return {
    id: row.id,
    status: row.status,
    question: row.question,
    semantic: row.semantic,
    roleKey: row.roleKey,
    roleLabel: row.roleLabel,
    level: row.level,
    contextTags: row.contextTags,
    focus: row.focus,
    lastPracticedAt: row.lastPracticedAt?.toISOString() ?? null,
    practiceCount: row.practiceCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
