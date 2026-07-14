import { CreateInterviewSessionRequestDto } from '@/shared/dto';
import type {
  AppendInterviewTurnMessageRequest,
  AnswerInterviewTurnRequest,
  CreateInterviewSessionRequest,
  CreateInterviewSessionRequestInput,
  GenerateInterviewHintsRequest,
  InterviewDialogueMessage,
  InterviewHintExample,
  InterviewPlan,
  InterviewPlanItem,
  InterviewSession,
  InterviewStateResponse,
  InterviewTurn,
  NextInterviewQuestionRequest,
  QuestionHintDetails,
  QuestionHintPack,
  ReplyInterviewTurnRequest,
  UpdateInterviewerRequest,
} from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import { assertOwnedInterviewSession } from './sessionOwnership';
import type { HhClient } from '@/server/interface/hh';
import type { InterviewEngine } from '@/server/interface/interviewEngine';
import type {
  InterviewRepository,
  InterviewSessionRecord,
  InterviewTurnRecord,
} from '@/server/interface/interviewRepository';
import {
  buildHintPack,
  buildInterviewPlanMetadata,
  injectRepeatPreferences,
  parseInterviewSessionMetadata,
  populateGeneratedPlanQuestions,
  resolveNextPlannedQuestion,
} from './interviewPlan';
import type { QuestionPreferenceRepository } from '@/server/interface/questionPreferenceRepository';
import {
  buildQuestionContext,
  matchesQuestionContext,
} from '@/shared/questionContext';
import { canonicalInterviewQuestionKey } from '@/shared/interviewQuestion';
import {
  avatarFromMode,
  modeFromFaceId,
} from './interviewerFace';
import { prepareInterviewSource } from './source';
import { getQuestionPacingConfig, resolveQuestionPacing } from './questionPacing';

export class InterviewService {
  constructor(
    private readonly deps: {
      repository: InterviewRepository;
      engine: InterviewEngine;
      hhClient: HhClient | null;
      questionPreferenceRepository?: QuestionPreferenceRepository;
    }
  ) {}

  async createSession(params: {
    anonymousSessionId: string;
    userId?: string | null;
    input: CreateInterviewSessionRequestInput;
  }): Promise<InterviewStateResponse> {
    const parsedInput = CreateInterviewSessionRequestDto.parse(params.input);
    const preparedSource = await prepareInterviewSource(parsedInput.source, {
      hhClient: this.deps.hhClient,
    });
    const input = await this.normalizeCustomQuestionsInput({
      input: parsedInput,
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId ?? null,
      role: parsedInput.role || preparedSource.role,
      vacancyTitle: preparedSource.vacancyTitle,
      vacancyRaw: preparedSource.vacancyRaw,
    });

    let metadata = buildInterviewPlanMetadata({
      input,
      role: input.role || preparedSource.role,
      vacancyTitle: preparedSource.vacancyTitle,
    });
    const generatedPlanSlots = metadata.plan.items.filter(
      (item) => item.source === 'glasno' && !item.question
    ).length;
    if (
      metadata.trainingMode === 'interviewer' &&
      generatedPlanSlots > 0 &&
      this.deps.engine.generateInterviewerPlan
    ) {
      const existingPlanQuestions = metadata.plan.items
        .map((item) => item.question)
        .filter((question): question is string => Boolean(question));
      const generatedPlan = await this.deps.engine.generateInterviewerPlan({
        anonymousSessionId: params.anonymousSessionId,
        userId: params.userId ?? null,
        role: input.role || preparedSource.role,
        vacancyTitle: preparedSource.vacancyTitle,
        vacancyText: preparedSource.vacancyRaw,
        resumeText: input.resumeText || null,
        level: input.level,
        focus: metadata.focus,
        questionsCount: generatedPlanSlots,
        existingQuestions: existingPlanQuestions,
      });
      const generatedQuestions = normalizeGeneratedPlanQuestions(
        generatedPlan.questions,
        existingPlanQuestions
      );
      if (generatedQuestions.length !== generatedPlanSlots) {
        throw apiError(
          'E_UPSTREAM',
          'Провайдер не вернул полный план интервью'
        );
      }
      metadata = populateGeneratedPlanQuestions(
        metadata,
        generatedQuestions,
        {
          role: input.role || preparedSource.role,
          vacancyTitle: preparedSource.vacancyTitle,
        }
      );
    }
    if (
      input.trainingMode === 'candidate' &&
      this.deps.questionPreferenceRepository
    ) {
      const context = buildQuestionContext({
        role:
          input.role ||
          preparedSource.role ||
          preparedSource.vacancyTitle ||
          'Не указана',
        level: input.level,
        specialization:
          input.source.type === 'profession'
            ? input.source.specialization
            : null,
        vacancyText: preparedSource.vacancyRaw,
        focus: metadata.focus,
      });
      const preferences = await this.deps.questionPreferenceRepository.listForOwner({
        anonymousSessionId: params.anonymousSessionId,
        userId: params.userId ?? null,
      });
      metadata = injectRepeatPreferences(
        metadata,
        preferences.filter((preference) =>
          matchesQuestionContext(preference, context)
        )
      );
    }

    const session = await this.deps.repository.createSession({
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId ?? null,
      trainingMode: input.trainingMode,
      source: preparedSource.source,
      vacancyTitle: preparedSource.vacancyTitle,
      vacancyRaw: preparedSource.vacancyRaw,
      vacancyUrl: preparedSource.vacancyUrl,
      companyName: preparedSource.companyName,
      resumeRaw: input.resumeText || null,
      role: input.role || preparedSource.role,
      level: input.level,
      questionCount: metadata.plan.items.length || 1,
      language: input.language,
      interviewerMode: input.interviewerMode,
      interviewerAvatarId: input.interviewerAvatarId,
      status: 'running',
      metadata: { ...metadata },
    });

    await this.createNextMainQuestionOrFinish(session, []);

    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  // Смена интервьюера в кабинете: новое лицо задаёт и внешность (фото-аватар),
  // и тон ИИ. Тон берётся из выбранного лица и применяется к следующим
  // репликам (replyTurnStream каждый раз перечитывает сессию).
  async updateInterviewer(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: UpdateInterviewerRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );

    const faceId = params.input.faceId;
    const mode = modeFromFaceId(faceId);
    const avatarId = avatarFromMode(mode);
    const metadata = {
      ...toMetaRecord(session.metadata),
      interviewerFaceId: faceId,
    };

    await this.deps.repository.updateSessionInterviewer(session.id, {
      interviewerMode: mode,
      interviewerAvatarId: avatarId,
      metadata,
    });

    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  private async normalizeCustomQuestionsInput(params: {
    input: CreateInterviewSessionRequest;
    anonymousSessionId: string;
    userId?: string | null;
    role?: string | null;
    vacancyTitle?: string | null;
    vacancyRaw?: string | null;
  }): Promise<CreateInterviewSessionRequest> {
    const rawText = params.input.customQuestionsText?.trim();
    if (!rawText) return params.input;

    const normalized = await this.deps.engine.normalizeCustomQuestions({
      rawText,
      anonymousSessionId: params.anonymousSessionId,
      userId: params.userId ?? null,
      role: params.role,
      level: params.input.level,
      vacancyTitle: params.vacancyTitle,
      vacancyRaw: params.vacancyRaw,
      resumeText: params.input.resumeText,
      questionSourceMode: params.input.questionSourceMode,
    });
    const questions = normalizeQuestionList(normalized.questions, rawText);

    return {
      ...params.input,
      customQuestionsText: questions.join('\n'),
    };
  }

  async getState(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<InterviewStateResponse> {
    return this.getStateForSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
  }

  async deleteSession(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
  }): Promise<{ ok: true }> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    const deleted = await this.deps.repository.deleteSession(session.id);
    if (!deleted) {
      throw apiError('E_NOT_FOUND', 'Интервью не найдено');
    }
    return { ok: true };
  }

  async generateTurnHints(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: GenerateInterviewHintsRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }

    const normalizedMetadata = normalizeTurnMetadata(turn.metadata);
    const baseMeta = toMetaRecord(turn.metadata);
    const dialogue = normalizedMetadata.dialogue.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const exampleContext = resolveHintExampleContext(
      session,
      turn,
      normalizedMetadata.dialogue
    );

    if (normalizedMetadata.hintPack?.detailed) {
      const detailed = normalizedMetadata.hintPack.detailed;
      const storedExample = readStoredHintExample(
        session,
        turn,
        detailed
      );
      if (storedExample?.context === exampleContext) {
        return this.getStateForSession(
          params.anonymousSessionId,
          session.id,
          params.userId
        );
      }

      const turns = await this.deps.repository.listTurns(session.id);
      const example = await this.generateHintExample({
        session,
        turn,
        turns,
        exampleContext,
        dialogue,
      });

      await this.deps.repository.updateTurnMetadata(session.id, turn.id, {
        ...baseMeta,
        hintPack: {
          ...normalizedMetadata.hintPack,
          detailed: replaceHintExample(detailed, example),
        },
      });

      return this.getStateForSession(
        params.anonymousSessionId,
        session.id,
        params.userId
      );
    }

    const turns = await this.deps.repository.listTurns(session.id);
    const hintPack =
      normalizedMetadata.hintPack ??
      buildHintPack({
        question: turn.question,
        role: session.role,
        vacancyTitle: session.vacancyTitle,
      });
    const detailed = await this.deps.engine.generateQuestionHints({
      session,
      turn,
      turns,
      dialogue,
    });
    let nextDetailed = replaceHintExample(
      detailed,
      readStoredHintExample(session, turn, detailed) ??
        fallbackHintExample(session, turn, turn.question.trim())
    );

    if (nextDetailed.example?.context !== exampleContext) {
      const example = await this.generateHintExample({
        session,
        turn,
        turns,
        exampleContext,
        dialogue,
      });
      nextDetailed = replaceHintExample(nextDetailed, example);
    }

    await this.deps.repository.updateTurnMetadata(session.id, turn.id, {
      ...baseMeta,
      hintPack: {
        ...hintPack,
        detailed: nextDetailed,
      },
    });

    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  private async generateHintExample(params: {
    session: InterviewSessionRecord;
    turn: InterviewTurnRecord;
    turns: InterviewTurnRecord[];
    exampleContext: string;
    dialogue: Array<{ role: 'user' | 'interviewer'; content: string }>;
  }): Promise<InterviewHintExample> {
    if (this.deps.engine.generateHintExample) {
      const example = await this.deps.engine.generateHintExample(params);
      if (isUsableHintExample(params.session, example)) return example;
    }

    return fallbackHintExample(
      params.session,
      params.turn,
      params.exampleContext
    );
  }

  async answerTurn(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: AnswerInterviewTurnRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    if (session.status !== 'running') {
      throw apiError('E_CONFLICT', 'Интервью уже завершено');
    }

    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }
    if (turn.answerTranscript) {
      throw apiError('E_CONFLICT', 'На этот вопрос уже есть ответ');
    }

    await this.deps.repository.saveTurnAnswer(
      session.id,
      turn.id,
      params.input.answer.trim()
    );

    const turnsAfterAnswer = await this.deps.repository.listTurns(session.id);
    // Уточняющий вопрос задаём только к содержательному ответу на основной вопрос.
    // На мусор/«не знаю»/слишком короткие ответы — не плодим уточнения, идём дальше.
    if (
      session.trainingMode === 'candidate' &&
      turn.kind === 'main' &&
      !hasClarificationFor(turnsAfterAnswer, turn.id) &&
      isSubstantiveAnswer(params.input.answer)
    ) {
      const evaluation = await this.deps.engine.evaluateAnswer({
        session,
        turn,
        turns: turnsAfterAnswer,
        answer: params.input.answer.trim(),
      });
      if (evaluation.needsClarification && evaluation.question?.trim()) {
        await this.deps.repository.createTurn({
          sessionId: session.id,
          index: turn.index,
          kind: 'clarification',
          question: normalizeQuestion(evaluation.question),
          followUpForTurnId: turn.id,
        });
        return this.getStateForSession(
          params.anonymousSessionId,
          session.id,
          params.userId
        );
      }
    }

    await this.createNextMainQuestionOrFinish(session, turnsAfterAnswer);
    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  // Реплика кандидата в диалоге по текущему вопросу. Интервью НЕ двигается
  // дальше — ИИ ведёт живой диалог и при необходимости предлагает перейти.
  async replyTurn(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: ReplyInterviewTurnRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    if (session.status !== 'running') {
      throw apiError('E_CONFLICT', 'Интервью уже завершено');
    }

    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }

    const baseMeta = toMetaRecord(turn.metadata);
    const dialogue = parseDialogue(baseMeta.dialogue);
    const now = new Date();
    const questionPacingStartedAt =
      readIsoString(baseMeta.questionPacingStartedAt) ?? now.toISOString();
    const pacing = resolveQuestionPacing({
      goal: parseInterviewSessionMetadata(session.metadata).sessionGoal,
      startedAt: questionPacingStartedAt,
      lastReminderAt: readIsoString(baseMeta.questionPacingLastReminderAt),
      now,
    });
    const timeboxReminder =
      session.trainingMode === 'candidate' && pacing.shouldRemind;
    dialogue.push({
      role: 'user',
      content: params.input.message.trim(),
      at: now.toISOString(),
    });
    const exchanges = dialogue.filter((message) => message.role === 'user').length;
    const turns = await this.deps.repository.listTurns(session.id);

    const { reply, suggestMoveOn } = await this.deps.engine.converse({
      session,
      turn,
      turns,
      dialogue: dialogue.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      exchanges,
      timeboxReminder,
    });

    dialogue.push({
      role: 'interviewer',
      content: reply,
      at: new Date().toISOString(),
    });

    await this.deps.repository.updateTurnMetadata(session.id, turn.id, {
      ...baseMeta,
      dialogue,
      suggestMoveOn:
        session.trainingMode === 'candidate' &&
        (suggestMoveOn || timeboxReminder),
      questionPacingStartedAt,
      questionPacingLastReminderAt: timeboxReminder
        ? now.toISOString()
        : readIsoString(baseMeta.questionPacingLastReminderAt),
    });

    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  // Стримовая версия replyTurn: yield'ит дельты текста ответа интервьюера по
  // мере генерации, после завершения сохраняет диалог и отдаёт финальное
  // состояние интервью. Используется для «постепенного появления» ответа.
  async *replyTurnStream(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: ReplyInterviewTurnRequest;
  }): AsyncGenerator<
    | { type: 'delta'; text: string }
    | { type: 'done'; state: InterviewStateResponse },
    void,
    void
  > {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    if (session.status !== 'running') {
      throw apiError('E_CONFLICT', 'Интервью уже завершено');
    }

    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }

    const baseMeta = toMetaRecord(turn.metadata);
    const dialogue = parseDialogue(baseMeta.dialogue);
    const now = new Date();
    const questionPacingStartedAt =
      readIsoString(baseMeta.questionPacingStartedAt) ?? now.toISOString();
    const pacing = resolveQuestionPacing({
      goal: parseInterviewSessionMetadata(session.metadata).sessionGoal,
      startedAt: questionPacingStartedAt,
      lastReminderAt: readIsoString(baseMeta.questionPacingLastReminderAt),
      now,
    });
    const timeboxReminder =
      session.trainingMode === 'candidate' && pacing.shouldRemind;
    dialogue.push({
      role: 'user',
      content: params.input.message.trim(),
      at: now.toISOString(),
    });
    const exchanges = dialogue.filter((message) => message.role === 'user').length;
    const turns = await this.deps.repository.listTurns(session.id);

    const generator = this.deps.engine.converseStream({
      session,
      turn,
      turns,
      dialogue: dialogue.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      exchanges,
      timeboxReminder,
    });

    let reply = '';
    // eslint-disable-next-line no-useless-assignment -- явная инициализация для читаемости
    let suggestMoveOn = false;
    while (true) {
      const next = await generator.next();
      if (next.done) {
        suggestMoveOn = next.value?.suggestMoveOn ?? false;
        break;
      }
      if (next.value) {
        reply += next.value;
        yield { type: 'delta', text: next.value };
      }
    }

    reply = reply.trim();
    if (!reply) {
      throw apiError('E_UPSTREAM', 'Провайдер не вернул ответ интервьюера');
    }

    dialogue.push({
      role: 'interviewer',
      content: reply,
      at: new Date().toISOString(),
    });

    await this.deps.repository.updateTurnMetadata(session.id, turn.id, {
      ...baseMeta,
      dialogue,
      suggestMoveOn:
        session.trainingMode === 'candidate' &&
        (suggestMoveOn || timeboxReminder),
      questionPacingStartedAt,
      questionPacingLastReminderAt: timeboxReminder
        ? now.toISOString()
        : readIsoString(baseMeta.questionPacingLastReminderAt),
    });

    const state = await this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
    yield { type: 'done', state };
  }

  // Фактическая реплика realtime-диалога. Ничего не генерируем и не двигаем:
  // только сохраняем транскрипт для чата, перехода между вопросами и отчёта.
  async appendTurnMessage(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: AppendInterviewTurnMessageRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }

    const content = params.input.content.trim();
    if (!content) {
      throw apiError('E_VALIDATION', 'Пустая реплика не сохраняется');
    }

    const baseMeta = toMetaRecord(turn.metadata);
    const dialogue = parseDialogue(baseMeta.dialogue);
    const now = new Date();
    const questionPacingStartedAt =
      params.input.role === 'user'
        ? readIsoString(baseMeta.questionPacingStartedAt) ?? now.toISOString()
        : readIsoString(baseMeta.questionPacingStartedAt);
    const pacing = resolveQuestionPacing({
      goal: parseInterviewSessionMetadata(session.metadata).sessionGoal,
      startedAt: questionPacingStartedAt,
      lastReminderAt: readIsoString(baseMeta.questionPacingLastReminderAt),
      now,
    });
    const recordTimeboxReminder =
      session.trainingMode === 'candidate' &&
      params.input.role === 'interviewer' &&
      params.input.timeboxReminder === true &&
      pacing.shouldRemind;
    dialogue.push({
      role: params.input.role,
      content,
      at: now.toISOString(),
    });

    await this.deps.repository.updateTurnMetadata(session.id, turn.id, {
      ...baseMeta,
      dialogue,
      questionPacingStartedAt,
      questionPacingLastReminderAt: recordTimeboxReminder
        ? now.toISOString()
        : readIsoString(baseMeta.questionPacingLastReminderAt),
    });

    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  // Явный переход к следующему вопросу (кнопка / голосовая команда / согласие
  // с предложением ИИ). Фиксируем ответ текущего вопроса из диалога и двигаемся.
  async nextQuestion(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: NextInterviewQuestionRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    if (session.status !== 'running') {
      throw apiError('E_CONFLICT', 'Интервью уже завершено');
    }

    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }

    await this.finalizeTurnAnswer(session.id, turn);

    const turnsAfter = await this.deps.repository.listTurns(session.id);
    await this.createNextMainQuestionOrFinish(session, turnsAfter);
    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  // Завершение доступно в любой момент, в том числе в свободном сценарии,
  // где кнопки перехода к следующему пункту намеренно нет.
  async finishInterview(params: {
    anonymousSessionId: string;
    userId?: string | null;
    sessionId: string;
    input: NextInterviewQuestionRequest;
  }): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      params.anonymousSessionId,
      params.sessionId,
      params.userId
    );
    if (session.status === 'done') {
      return this.getStateForSession(
        params.anonymousSessionId,
        session.id,
        params.userId
      );
    }
    if (session.status !== 'running') {
      throw apiError('E_CONFLICT', 'Интервью ещё не начато');
    }

    const turn = await this.deps.repository.findTurnById(
      session.id,
      params.input.turnId
    );
    if (!turn) {
      throw apiError('E_NOT_FOUND', 'Вопрос не найден');
    }

    await this.finalizeTurnAnswer(session.id, turn);
    await this.deps.repository.completeSession(session.id);
    return this.getStateForSession(
      params.anonymousSessionId,
      session.id,
      params.userId
    );
  }

  private async finalizeTurnAnswer(
    sessionId: string,
    turn: InterviewTurnRecord
  ): Promise<void> {
    if (turn.answerTranscript) return;

    const baseMeta = toMetaRecord(turn.metadata);
    const dialogue = parseDialogue(baseMeta.dialogue);
    const answerText = dialogue
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
      .join('\n')
      .trim();
    // Пустую строку сохранять нельзя — currentTurn ищется по !answerTranscript.
    await this.deps.repository.saveTurnAnswer(
      sessionId,
      turn.id,
      answerText || '—'
    );
  }

  private async createNextMainQuestionOrFinish(
    session: InterviewSessionRecord,
    turns: InterviewTurnRecord[]
  ) {
    const mainTurns = turns.filter((turn) => turn.kind === 'main');
    const metadata = parseInterviewSessionMetadata(session.metadata);
    if (metadata.questionSourceMode === 'free') {
      if (mainTurns.length === 0) {
        await this.deps.repository.createTurn({
          sessionId: session.id,
          index: 1,
          kind: 'main',
          question: 'Свободное интервью',
          metadata: {
            questionSource: 'glasno',
            hintPack: buildHintPack({
              question: 'Свободное интервью',
              role: session.role,
              vacancyTitle: session.vacancyTitle,
            }),
          },
        });
        return;
      }
      await this.deps.repository.completeSession(session.id);
      return;
    }

    if (mainTurns.length >= session.questionCount) {
      await this.deps.repository.completeSession(session.id);
      return;
    }

    const planned = resolveNextPlannedQuestion({ metadata, turns });
    if (!planned) {
      await this.deps.repository.completeSession(session.id);
      return;
    }

    let question = planned.question;
    let hintPack = planned.hintPack;

    if (planned.source === 'glasno' && !question) {
      const questionContext = this.getSessionQuestionContext(session);
      const questionPreferences = await this.getGenerationPreferences(
        session,
        questionContext
      );
      const generated = await this.deps.engine.generateQuestion({
        session,
        turns,
        input: {
          trainingMode: session.trainingMode,
          source: {
            type:
              session.source === 'hh_url'
                ? 'text'
                : (session.source as 'text' | 'profession'),
            text: session.vacancyRaw || session.role || 'Вакансия не указана',
            title: session.vacancyTitle || undefined,
            role: session.role || undefined,
          } as CreateInterviewSessionRequest['source'],
          resumeText: session.resumeRaw || undefined,
          candidatePersona: metadata.candidatePersona,
          candidateDifficulty: metadata.candidateDifficulty,
          candidateNotes: metadata.candidateNotes ?? undefined,
          role: session.role || undefined,
          level: session.level || 'middle',
          sessionGoal: metadata.sessionGoal,
          questionSourceMode: metadata.questionSourceMode,
          focus: metadata.focus ?? undefined,
          responseMode: metadata.responseMode,
          hintMode: metadata.hintMode,
          language: session.language,
          interviewerMode: session.interviewerMode,
          interviewerAvatarId: session.interviewerAvatarId,
          interviewerFaceId: metadata.interviewerFaceId,
        },
        questionPreferences,
        questionContextTags: questionContext.contextTags,
      });
      question = generated.question;
      planned.semantic = generated.semantic ?? null;
      hintPack = buildHintPack({
        question,
        role: session.role,
        vacancyTitle: session.vacancyTitle,
      });
    }

    const createdTurn = await this.deps.repository.createTurn({
      sessionId: session.id,
      index: mainTurns.length + 1,
      kind: 'main',
      question: normalizeQuestion(question),
      metadata: {
        planItemId: planned.planItemId,
        questionSource: planned.source,
        hintPack,
        preferenceId: planned.preferenceId ?? null,
        semantic: planned.semantic ?? null,
      },
    });
    if (
      planned.source === 'repeat' &&
      planned.preferenceId &&
      this.deps.questionPreferenceRepository
    ) {
      await this.deps.questionPreferenceRepository.markPracticed(
        [planned.preferenceId],
        createdTurn.createdAt
      );
    }
  }

  private getSessionQuestionContext(session: InterviewSessionRecord) {
    const metadata = parseInterviewSessionMetadata(session.metadata);
    return buildQuestionContext({
      role: session.role || session.vacancyTitle || 'Не указана',
      level: session.level || 'middle',
      vacancyText: session.vacancyRaw,
      focus: metadata.focus,
    });
  }

  private async getGenerationPreferences(
    session: InterviewSessionRecord,
    context: ReturnType<typeof buildQuestionContext>
  ) {
    const repository = this.deps.questionPreferenceRepository;
    if (!repository || session.trainingMode !== 'candidate') return [];
    const preferences = await repository.listForOwner({
      anonymousSessionId: session.anonymousSessionId,
      userId: session.userId,
    });
    return preferences
      .filter(
        (preference) =>
          (preference.status === 'repeat' || preference.status === 'hidden') &&
          matchesQuestionContext(preference, context)
      )
      .map((preference) => ({
        id: preference.id,
        status: preference.status as 'repeat' | 'hidden',
        question: preference.question,
        semantic: preference.semantic,
      }));
  }

  private async getStateForSession(
    anonymousSessionId: string,
    sessionId: string,
    userId?: string | null
  ): Promise<InterviewStateResponse> {
    const session = await this.requireOwnedSession(
      anonymousSessionId,
      sessionId,
      userId
    );
    const turns = await this.deps.repository.listTurns(session.id);
    return toState(session, turns);
  }

  private async requireOwnedSession(
    anonymousSessionId: string,
    sessionId: string,
    userId?: string | null
  ): Promise<InterviewSessionRecord> {
    const session = await this.deps.repository.findSessionById(sessionId);
    return assertOwnedInterviewSession(session, { anonymousSessionId, userId });
  }
}

function normalizeQuestion(question: string): string {
  const normalized = question.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    throw apiError('E_UPSTREAM', 'LLM вернул пустой вопрос');
  }
  return normalized;
}

function normalizeGeneratedPlanQuestions(
  questions: string[],
  existingQuestions: string[] = []
): string[] {
  const seen = new Set(
    existingQuestions.map(canonicalInterviewQuestionKey)
  );
  const normalized: string[] = [];
  for (const rawQuestion of questions) {
    const question = rawQuestion.trim().replace(/\s+/g, ' ');
    if (!question) continue;
    const key = canonicalInterviewQuestionKey(question);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(question);
  }
  return normalized;
}

function normalizeQuestionList(questions: string[], fallbackRaw: string): string[] {
  const source = questions.length ? questions : fallbackRaw.split(/\n|;|(?<=\?)\s+/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of source) {
    const question = normalizeQuestionCandidate(item);
    if (!question || question.length < 8) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(question);
  }

  return result.slice(0, 12);
}

function normalizeQuestionCandidate(value: string): string {
  const normalized = value
    .trim()
    .replace(/^\d+[).:-]\s*/, '')
    .replace(/\s+/g, ' ');
  if (!normalized) return '';
  return /[?.!]$/.test(normalized) ? normalized : `${normalized}?`;
}

function hasClarificationFor(turns: InterviewTurnRecord[], turnId: string): boolean {
  return turns.some(
    (turn) => turn.kind === 'clarification' && turn.followUpForTurnId === turnId
  );
}

const LOW_EFFORT_ANSWER =
  /^(не\s*знаю|незнаю|не\s*уверен|ничего|хз|пропустить|пропуск|skip|нет|—|-|\.)\.?$/i;

// Содержательный ли ответ: есть смысл задавать уточняющий вопрос.
// Отсекаем слишком короткие, односложные и «не знаю»-ответы.
function isSubstantiveAnswer(answer: string): boolean {
  const text = answer.trim();
  if (text.length < 40) return false;
  if (LOW_EFFORT_ANSWER.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;
  return true;
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function readIsoString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toSessionDto(
  session: InterviewSessionRecord,
  turns: InterviewTurnRecord[]
): InterviewSession {
  const mainTurns = turns.filter((turn) => turn.kind === 'main');
  const metadata = parseInterviewSessionMetadata(session.metadata);
  const currentTurn = turns.find((turn) => !turn.answerTranscript) ?? null;
  const currentQuestionIndex =
    currentTurn?.kind === 'main'
      ? currentTurn.index
      : mainTurns.at(-1)?.index ?? mainTurns.length;

    return {
      id: session.id,
      status: session.status,
      trainingMode: session.trainingMode,
      source: session.source,
    vacancyTitle: session.vacancyTitle,
    vacancyUrl: session.vacancyUrl,
    companyName: session.companyName,
    role: session.role,
    level: session.level,
    questionCount: session.questionCount,
    sessionGoal: metadata.sessionGoal,
    expectedDurationMinutes: metadata.expectedDurationMinutes,
    questionSourceMode: metadata.questionSourceMode,
    focus: metadata.focus,
    responseMode: metadata.responseMode,
    hintMode: metadata.hintMode,
    realtimeLimits: metadata.realtimeLimits,
    questionPacing: getQuestionPacingConfig(metadata.sessionGoal),
    plan: toPlanDto(metadata.plan, turns),
    language: session.language,
    interviewerMode: session.interviewerMode,
    interviewerAvatarId: session.interviewerAvatarId,
    interviewerFaceId: metadata.interviewerFaceId,
    candidatePersona: metadata.candidatePersona,
    candidateDifficulty: metadata.candidateDifficulty,
    candidateNotes: metadata.candidateNotes,
    currentQuestionIndex,
    totalQuestions: session.questionCount,
    createdAt: toIso(session.createdAt)!,
  };
}

function toTurnDto(turn: InterviewTurnRecord): InterviewTurn {
  const metadata = normalizeTurnMetadata(turn.metadata);
  return {
    id: turn.id,
    sessionId: turn.sessionId,
    index: turn.index,
    kind: turn.kind,
    question: turn.question,
    questionSource: metadata.questionSource,
    planItemId: metadata.planItemId,
    hintPack: metadata.hintPack,
    answerTranscript: turn.answerTranscript,
    followUpForTurnId: turn.followUpForTurnId,
    answeredAt: toIso(turn.answeredAt),
    createdAt: toIso(turn.createdAt)!,
    messages: metadata.dialogue,
    suggestMoveOn: metadata.suggestMoveOn,
    questionPacingStartedAt: metadata.questionPacingStartedAt,
    questionPacingLastReminderAt: metadata.questionPacingLastReminderAt,
    preference: metadata.preference,
  };
}

// Приводит metadata турна к объекту (или пустому), чтобы безопасно мёржить.
function toMetaRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object'
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

// Разбирает массив реплик диалога из metadata.
function parseDialogue(value: unknown): InterviewDialogueMessage[] {
  if (!Array.isArray(value)) return [];
  const result: InterviewDialogueMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as { role?: unknown; content?: unknown; at?: unknown };
    const role = raw.role === 'interviewer' ? 'interviewer' : 'user';
    const content = typeof raw.content === 'string' ? raw.content : '';
    if (!content) continue;
    const at = typeof raw.at === 'string' ? raw.at : new Date().toISOString();
    result.push({ role, content, at });
  }
  return result;
}

function resolveHintExampleContext(
  session: InterviewSessionRecord,
  turn: InterviewTurnRecord,
  dialogue: InterviewDialogueMessage[]
): string {
  const context =
    session.trainingMode === 'interviewer'
      ? latestAiCandidateReplyForHints(dialogue)
      : latestInterviewerQuestionForHints(dialogue);
  return normalizeHintContext(context ?? turn.question);
}

function latestInterviewerQuestionForHints(
  dialogue: InterviewDialogueMessage[]
): string | null {
  for (let index = dialogue.length - 1; index >= 0; index -= 1) {
    const message = dialogue[index];
    if (!message) continue;
    if (message.role !== 'interviewer') continue;
    const question = extractQuestionPrompt(message.content);
    if (question && !isMoveOnPrompt(question)) return question;
  }
  return null;
}

function latestAiCandidateReplyForHints(
  dialogue: InterviewDialogueMessage[]
): string | null {
  for (let index = dialogue.length - 1; index >= 0; index -= 1) {
    const message = dialogue[index];
    if (!message || message.role !== 'interviewer') continue;
    const content = message.content.trim();
    if (content) return content;
  }
  return null;
}

function normalizeHintContext(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 1_200) || 'Текущий этап интервью.';
}

function isDirectInterviewerQuestion(value: string): boolean {
  const text = value.trim();
  return (
    text.endsWith('?') &&
    !/(?:^|[\s.!?])(?:я|мы)(?=$|[\s,.!?;:])/iu.test(text)
  );
}

function fallbackInterviewerHintQuestion(
  session: InterviewSessionRecord,
  turn: InterviewTurnRecord
): string {
  const plannedQuestion = turn.question.trim();
  if (isDirectInterviewerQuestion(plannedQuestion)) return plannedQuestion;

  const role = session.role?.trim().slice(0, 160);
  return role
    ? `Расскажите, пожалуйста, о последнем релевантном проекте в роли ${role}?`
    : 'Расскажите, пожалуйста, о последнем релевантном проекте?';
}

function fallbackHintExample(
  session: InterviewSessionRecord,
  turn: InterviewTurnRecord,
  context: string
): InterviewHintExample {
  const normalizedContext = normalizeHintContext(context);
  if (session.trainingMode === 'interviewer') {
    return {
      kind: 'interviewer_question',
      context: normalizedContext,
      text: fallbackInterviewerHintQuestion(session, turn),
      followUps: [],
    };
  }

  return {
    kind: 'candidate_answer',
    context: normalizedContext,
    text:
      'Я бы коротко ответил по существу, добавил один релевантный пример и завершил результатом, не выдумывая фактов.',
  };
}

function readStoredHintExample(
  session: InterviewSessionRecord,
  turn: InterviewTurnRecord,
  detailed: QuestionHintDetails
): InterviewHintExample | null {
  const example = detailed.example;
  if (session.trainingMode === 'interviewer') {
    if (example && isUsableHintExample(session, example)) {
      return example;
    }
    return null;
  }

  if (example?.kind === 'candidate_answer') return example;
  if (!detailed.sampleAnswer) return null;
  return {
    kind: 'candidate_answer',
    context: normalizeHintContext(
      detailed.sampleAnswerQuestion || turn.question
    ),
    text: detailed.sampleAnswer,
  };
}

function isUsableHintExample(
  session: InterviewSessionRecord,
  example: InterviewHintExample
): boolean {
  if (session.trainingMode !== 'interviewer') {
    return example.kind === 'candidate_answer' && Boolean(example.text.trim());
  }

  return (
    example.kind === 'interviewer_question' &&
    isDirectInterviewerQuestion(example.text) &&
    example.followUps.length <= 2 &&
    example.followUps.every(isDirectInterviewerQuestion)
  );
}

function replaceHintExample(
  detailed: QuestionHintDetails,
  example: InterviewHintExample
): QuestionHintDetails {
  const {
    sampleAnswer: _legacySampleAnswer,
    sampleAnswerQuestion: _legacySampleAnswerQuestion,
    ...nextDetailed
  } = detailed;
  return {
    ...nextDetailed,
    example,
  };
}

function extractQuestionPrompt(content: string): string | null {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const questionEnd = normalized.lastIndexOf('?');
  if (questionEnd < 0) return null;

  const prefix = normalized.slice(0, questionEnd);
  const boundary = Math.max(
    prefix.lastIndexOf('.'),
    prefix.lastIndexOf('!'),
    prefix.lastIndexOf('?')
  );
  const question = normalized.slice(boundary + 1, questionEnd + 1).trim();
  return question || null;
}

function isMoveOnPrompt(question: string): boolean {
  return /следующ[а-яё]*\s+вопрос|перей[а-яё]*\s+(?:к|ко)\s+следующ|дальше/iu.test(
    question
  );
}

function toPlanDto(
  plan: InterviewPlan,
  turns: InterviewTurnRecord[]
): InterviewPlan {
  const turnsByPlanItemId = new Map<string, InterviewTurnRecord>();
  for (const turn of turns) {
    const planItemId = normalizeTurnMetadata(turn.metadata).planItemId;
    if (planItemId && turn.kind === 'main') {
      turnsByPlanItemId.set(planItemId, turn);
    }
  }

  return {
    ...plan,
    items: plan.items.map((item): InterviewPlanItem => {
      const askedTurn = turnsByPlanItemId.get(item.id);
      if (!askedTurn) return item;
      const turnMetadata = normalizeTurnMetadata(askedTurn.metadata);
      return {
        ...item,
        question: askedTurn.question,
        status: 'asked',
        hintPack: turnMetadata.hintPack ?? item.hintPack,
      };
    }),
  };
}

function normalizeTurnMetadata(metadata: unknown): {
  planItemId: string | null;
  questionSource: 'glasno' | 'user' | 'repeat';
  hintPack: QuestionHintPack | null;
  dialogue: InterviewDialogueMessage[];
  suggestMoveOn: boolean;
  questionPacingStartedAt: string | null;
  questionPacingLastReminderAt: string | null;
  preference: { id: string; status: 'repeat' | 'mastered' | 'hidden' } | null;
} {
  if (!metadata || typeof metadata !== 'object') {
    return {
      planItemId: null,
      questionSource: 'glasno',
      hintPack: null,
      dialogue: [],
      suggestMoveOn: false,
      questionPacingStartedAt: null,
      questionPacingLastReminderAt: null,
      preference: null,
    };
  }
  const raw = metadata as {
    planItemId?: unknown;
    questionSource?: unknown;
    hintPack?: unknown;
    dialogue?: unknown;
    suggestMoveOn?: unknown;
    questionPacingStartedAt?: unknown;
    questionPacingLastReminderAt?: unknown;
    preference?: unknown;
  };
  return {
    planItemId:
      typeof raw.planItemId === 'string' && raw.planItemId.trim()
        ? raw.planItemId
        : null,
    questionSource:
      raw.questionSource === 'user' || raw.questionSource === 'repeat'
        ? raw.questionSource
        : 'glasno',
    hintPack:
      raw.hintPack && typeof raw.hintPack === 'object'
        ? (raw.hintPack as QuestionHintPack)
        : null,
    dialogue: parseDialogue(raw.dialogue),
    suggestMoveOn: raw.suggestMoveOn === true,
    questionPacingStartedAt: readIsoString(raw.questionPacingStartedAt),
    questionPacingLastReminderAt: readIsoString(raw.questionPacingLastReminderAt),
    preference: normalizeQuestionPreferenceSummary(raw.preference),
  };
}

function normalizeQuestionPreferenceSummary(
  value: unknown
): { id: string; status: 'repeat' | 'mastered' | 'hidden' } | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { id?: unknown; status?: unknown };
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  if (
    raw.status !== 'repeat' &&
    raw.status !== 'mastered' &&
    raw.status !== 'hidden'
  ) {
    return null;
  }
  return { id: raw.id, status: raw.status };
}

function toState(
  session: InterviewSessionRecord,
  turns: InterviewTurnRecord[]
): InterviewStateResponse {
  const turnDtos = turns.map(toTurnDto);
  return {
    session: toSessionDto(session, turns),
    turns: turnDtos,
    currentTurn:
      session.status === 'running'
        ? turnDtos.find((turn) => !turn.answerTranscript) ?? null
        : null,
  };
}
