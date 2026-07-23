import { describe, expect, it, vi } from 'vitest';
import { InterviewService } from './interviewService';

function createInMemoryRepository() {
  const sessions: any[] = [];
  const turns: any[] = [];
  const completeSession = vi.fn(async (id: string) => {
    const session = sessions.find((item) => item.id === id);
    if (!session) return null;
    session.status = 'done';
    return session;
  });

  return {
    sessions,
    turns,
    async createSession(input: any) {
      const session = {
        id: `session_${sessions.length + 1}`,
        status: 'running',
        createdAt: new Date('2026-06-28T10:00:00.000Z'),
        ...input,
      };
      sessions.push(session);
      return session;
    },
    async findSessionById(id: string) {
      return sessions.find((session) => session.id === id) ?? null;
    },
    async updateSessionStatus(id: string, status: string) {
      const session = sessions.find((item) => item.id === id);
      if (!session) return null;
      session.status = status;
      return session;
    },
    completeSession,
    async updateSessionInterviewer(id: string, fields: any) {
      const session = sessions.find((item) => item.id === id);
      if (!session) return null;
      session.interviewerMode = fields.interviewerMode;
      session.interviewerAvatarId = fields.interviewerAvatarId;
      session.metadata = fields.metadata;
      return session;
    },
    async updateSessionMetadata(id: string, metadata: any) {
      const session = sessions.find((item) => item.id === id);
      if (!session) return null;
      session.metadata = metadata;
      return session;
    },
    async listCanonicalQuestionIdsForOwner(owner: {
      anonymousSessionId: string;
      userId?: string | null;
    }) {
      return sessions
        .filter((session) =>
          owner.userId
            ? session.userId === owner.userId
            : !session.userId && session.anonymousSessionId === owner.anonymousSessionId
        )
        .flatMap((session) => session.metadata?.plan?.items ?? [])
        .map((item) => item.canonicalQuestionId)
        .filter((id): id is string => typeof id === 'string' && Boolean(id));
    },
    async listTurns(sessionId: string) {
      return turns
        .filter((turn) => turn.sessionId === sessionId)
        .sort((left, right) => left.createdOrder - right.createdOrder);
    },
    async findTurnById(sessionId: string, turnId: string) {
      return (
        turns.find((turn) => turn.sessionId === sessionId && turn.id === turnId) ??
        null
      );
    },
    async createTurn(input: any) {
      const turn = {
        id: `turn_${turns.length + 1}`,
        answerTranscript: null,
        answeredAt: null,
        createdAt: new Date('2026-06-28T10:00:00.000Z'),
        createdOrder: turns.length + 1,
        ...input,
      };
      turns.push(turn);
      return turn;
    },
    async saveTurnAnswer(sessionId: string, turnId: string, answer: string) {
      const turn = turns.find(
        (item) => item.sessionId === sessionId && item.id === turnId
      );
      if (!turn) return null;
      turn.answerTranscript = answer;
      turn.answeredAt = new Date('2026-06-28T10:05:00.000Z');
      return turn;
    },
    async updateTurnMetadata(
      sessionId: string,
      turnId: string,
      metadata: Record<string, unknown>
    ) {
      const turn = turns.find(
        (item) => item.sessionId === sessionId && item.id === turnId
      );
      if (!turn) return null;
      turn.metadata = metadata;
      return turn;
    },
    async deleteSession(id: string) {
      const sessionIndex = sessions.findIndex((session) => session.id === id);
      if (sessionIndex === -1) return false;
      sessions.splice(sessionIndex, 1);
      for (let index = turns.length - 1; index >= 0; index -= 1) {
        if (turns[index].sessionId === id) {
          turns.splice(index, 1);
        }
      }
      return true;
    },
  };
}

describe('InterviewService', () => {
  it('continues the canonical question cycle for the same interview owner', async () => {
    const repository = createInMemoryRepository();
    const candidates = Array.from({ length: 7 }, (_, index) => ({
      id: `canonical_${index + 1}`,
      corpusId: `frontend_concept_${index + 1}`,
      roleKey: 'it-frontend',
      roleLabel: 'Frontend-разработчик',
      framework: 'none' as const,
      seniority: 'middle' as const,
      interviewType: 'technical' as const,
      topic: 'javascript',
      subtopic: null,
      question: `Канонический вопрос ${index + 1}?`,
      tags: ['javascript'],
      expectedConcepts: [],
    }));
    const engine = {
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Контекстный вопрос?' }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
      converse: vi.fn(),
      converseStream: vi.fn(),
    };
    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
      canonicalQuestionRepository: {
        listCandidates: vi.fn().mockResolvedValue(candidates),
        findCanonicalById: vi.fn(),
      },
    });
    const input = {
      source: { type: 'profession' as const, role: 'Frontend-разработчик' },
      level: 'middle' as const,
      sessionGoal: 'standard' as const,
      responseMode: 'text' as const,
      hintMode: 'off' as const,
      language: 'ru' as const,
      interviewerMode: 'neutral' as const,
      interviewerAvatarId: 'neutral-pro' as const,
      focus: 'professional' as const,
    };

    await service.createSession({
      anonymousSessionId: 'anon_cycle',
      input,
    });
    const second = await service.createSession({
      anonymousSessionId: 'anon_cycle',
      input,
    });

    const selectedIds = (session: (typeof repository.sessions)[number]) =>
      ((session.metadata?.plan as { items?: Array<{ canonicalQuestionId?: string }> })
        ?.items ?? [])
        .map((item) => item.canonicalQuestionId)
        .filter((id): id is string => Boolean(id));

    expect(selectedIds(repository.sessions[0])).toEqual([
      'canonical_1',
      'canonical_2',
      'canonical_3',
      'canonical_4',
      'canonical_5',
    ]);
    expect(selectedIds(repository.sessions[1])).toEqual([
      'canonical_6',
      'canonical_7',
      'canonical_1',
      'canonical_2',
      'canonical_3',
    ]);
    expect(second.currentTurn?.question).toBe('Канонический вопрос 6?');
  });

  it('finishes a running interview early and finalizes the current dialogue', async () => {
    const repository = createInMemoryRepository();
    const service = new InterviewService({
      repository,
      engine: {} as never,
      hhClient: null,
    });
    repository.sessions.push({
      id: 'session_early_finish',
      anonymousSessionId: 'anon_early_finish',
      userId: null,
      status: 'running',
      questionCount: 3,
      metadata: {},
    });
    repository.turns.push({
      id: 'turn_early_finish',
      sessionId: 'session_early_finish',
      kind: 'main',
      answerTranscript: null,
      metadata: {
        dialogue: [
          { role: 'user', content: 'Расскажите о вашем основном проекте.' },
          { role: 'interviewer', content: 'Я запускал новый личный кабинет.' },
        ],
      },
    });

    const state = await service.finishInterview({
      anonymousSessionId: 'anon_early_finish',
      sessionId: 'session_early_finish',
      input: { turnId: 'turn_early_finish' },
    });

    expect(repository.turns[0].answerTranscript).toBe(
      'Расскажите о вашем основном проекте.'
    );
    expect(repository.completeSession).toHaveBeenCalledWith(
      'session_early_finish'
    );
    expect(state.session.status).toBe('done');
  });

  it('завершает интервью через атомарную фиксацию использованной бесплатной попытки', async () => {
    const repository = createInMemoryRepository();
    const service = new InterviewService({
      repository,
      engine: {} as never,
      hhClient: null,
    });

    repository.sessions.push({
      id: 'session_done',
      questionCount: 1,
      status: 'running',
    });

    const serviceWithCompletion = service as unknown as {
      createNextMainQuestionOrFinish(
        session: { id: string; questionCount: number },
        turns: Array<{ kind: string }>
      ): Promise<void>;
    };
    await serviceWithCompletion.createNextMainQuestionOrFinish(
      repository.sessions[0],
      [{ kind: 'main' }]
    );

    expect(repository.completeSession).toHaveBeenCalledWith('session_done');
  });

  it('starts with a matching repeat and excludes repeat/hidden concepts from later generation', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi.fn().mockResolvedValue({
        question: 'Как вы оптимизируете JavaScript-бандл?',
        semantic: {
          conceptKey: 'bundle_optimization',
          conceptLabel: 'Оптимизация бандла',
          topicTags: ['javascript'],
          requiredContextTags: [],
          focus: 'professional',
        },
      }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };
    const now = new Date('2026-07-12T00:00:00.000Z');
    const preferences = [
      {
        id: 'repeat_1',
        anonymousSessionId: 'anon_1',
        userId: null,
        status: 'repeat',
        question: 'Как браузер строит DOM и CSSOM?',
        conceptKey: 'browser_rendering',
        semantic: {
          conceptKey: 'browser_rendering',
          conceptLabel: 'Построение DOM и CSSOM',
          topicTags: ['dom', 'cssom'],
          requiredContextTags: [],
          focus: 'professional',
        },
        roleKey: 'it-frontend',
        roleLabel: 'Frontend-разработчик',
        level: 'middle',
        contextTags: [],
        focus: 'professional',
        sourceSessionId: null,
        sourceTurnId: null,
        lastPracticedAt: null,
        practiceCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'hidden_1',
        anonymousSessionId: 'anon_1',
        userId: null,
        status: 'hidden',
        question: 'Что такое CSS?',
        conceptKey: 'css_basics',
        semantic: null,
        roleKey: 'it-frontend',
        roleLabel: 'Frontend-разработчик',
        level: 'middle',
        contextTags: [],
        focus: 'professional',
        sourceSessionId: null,
        sourceTurnId: null,
        lastPracticedAt: null,
        practiceCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mastered_1',
        anonymousSessionId: 'anon_1',
        userId: null,
        status: 'mastered',
        question: 'Что такое HTML?',
        conceptKey: 'html_basics',
        semantic: null,
        roleKey: 'it-frontend',
        roleLabel: 'Frontend-разработчик',
        level: 'middle',
        contextTags: [],
        focus: 'professional',
        sourceSessionId: null,
        sourceTurnId: null,
        lastPracticedAt: null,
        practiceCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    ] as any[];
    const questionPreferenceRepository = {
      listForOwner: vi.fn().mockResolvedValue(preferences),
      markPracticed: vi.fn(),
    };
    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
      questionPreferenceRepository: questionPreferenceRepository as any,
    });

    const created = await service.createSession({
      anonymousSessionId: 'anon_1',
      input: {
        source: { type: 'profession', role: 'Frontend-разработчик' },
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
        focus: 'professional',
      },
    });

    expect(created.currentTurn).toMatchObject({
      question: 'Как браузер строит DOM и CSSOM?',
      questionSource: 'repeat',
    });
    expect(engine.generateQuestion).not.toHaveBeenCalled();
    expect(questionPreferenceRepository.markPracticed).toHaveBeenCalledWith(
      ['repeat_1'],
      expect.any(Date)
    );

    await service.nextQuestion({
      anonymousSessionId: 'anon_1',
      sessionId: created.session.id,
      input: { turnId: created.currentTurn!.id },
    });

    expect(engine.generateQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        questionPreferences: expect.arrayContaining([
          expect.objectContaining({ id: 'repeat_1', status: 'repeat' }),
          expect.objectContaining({ id: 'hidden_1', status: 'hidden' }),
        ]),
      })
    );
    const passedPreferences = engine.generateQuestion.mock.calls[0]![0]
      .questionPreferences;
    expect(passedPreferences).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'mastered_1' })])
    );
  });

  it('creates a running anonymous interview session with the first question', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Расскажите о релевантном опыте.' }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
      converse: vi.fn(),
      converseStream: vi.fn(),
    };

    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const state = await service.createSession({
      anonymousSessionId: 'anon_1',
      input: {
        source: { type: 'text', text: 'Ищем менеджера по продажам B2B.' },
        role: 'Менеджер по продажам',
        level: 'middle',
        questionCount: 3,
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    expect(repository.sessions[0]).toMatchObject({
      anonymousSessionId: 'anon_1',
      source: 'text',
      role: 'Менеджер по продажам',
      status: 'running',
      questionCount: 3,
    });
    expect(state.currentTurn).toMatchObject({
      kind: 'main',
      index: 1,
      question: 'Расскажите о релевантном опыте.',
    });
    expect(engine.generateQuestion).toHaveBeenCalledOnce();
  });

  it('normalizes custom questions through the interview engine before building the plan', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn().mockResolvedValue({
        questions: [
          'Как вы выстраиваете план продаж?',
          'Расскажите про сложные переговоры с клиентом?',
        ],
      }),
      generateQuestion: vi.fn(),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };

    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const state = await service.createSession({
      anonymousSessionId: 'anon_1',
      input: {
        source: { type: 'profession', role: 'Менеджер по продажам' },
        level: 'middle',
        sessionGoal: 'quick',
        questionSourceMode: 'custom',
        customQuestionsText:
          'спроси план продаж; сложные переговоры; сложные переговоры',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    expect(engine.normalizeCustomQuestions).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText: 'спроси план продаж; сложные переговоры; сложные переговоры',
        role: 'Менеджер по продажам',
      })
    );
    expect(engine.generateQuestion).not.toHaveBeenCalled();
    expect(state.session.plan.items).toHaveLength(2);
    expect(state.session.plan.items.map((item) => item.question)).toEqual([
      'Как вы выстраиваете план продаж?',
      'Расскажите про сложные переговоры с клиентом?',
    ]);
    expect(state.currentTurn).toMatchObject({
      question: 'Как вы выстраиваете план продаж?',
      questionSource: 'user',
    });
  });

  it('creates interviewer training sessions with candidate resume context', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Начните интервью с кандидатом.' }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };

    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    await service.createSession({
      anonymousSessionId: 'anon_interviewer',
      input: {
        trainingMode: 'interviewer',
        source: {
          type: 'text',
          title: 'Frontend-разработчик',
          text: 'Нужен Vue/TypeScript разработчик в продуктовую команду.',
        },
        resumeText:
          'Кандидат: frontend-разработчик, 4 года опыта, Vue, TypeScript.',
        candidatePersona: 'strong_brief',
        candidateDifficulty: 'realistic',
        candidateNotes: 'Отвечает кратко, но конкретно.',
        role: 'Frontend-разработчик',
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    expect(repository.sessions[0]).toMatchObject({
      trainingMode: 'interviewer',
      resumeRaw:
        'Кандидат: frontend-разработчик, 4 года опыта, Vue, TypeScript.',
      metadata: expect.objectContaining({
        trainingMode: 'interviewer',
        candidatePersona: 'strong_brief',
        candidateDifficulty: 'realistic',
        candidateNotes: 'Отвечает кратко, но конкретно.',
      }),
    });
  });

  it('creates one silent conversation bucket for a free interviewer-training session', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi.fn(),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };

    const service = new InterviewService({ repository, engine, hhClient: null });
    const state = await service.createSession({
      anonymousSessionId: 'anon_free_interviewer',
      input: {
        trainingMode: 'interviewer',
        source: { type: 'profession', role: 'Frontend-разработчик' },
        questionSourceMode: 'free',
        level: 'middle',
        sessionGoal: 'standard',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    expect(state.session.questionSourceMode).toBe('free');
    expect(state.session.plan.items).toEqual([]);
    expect(state.session.totalQuestions).toBe(1);
    expect(state.currentTurn).toMatchObject({
      question: 'Свободное интервью',
      questionSource: 'glasno',
    });
    expect(engine.generateQuestion).not.toHaveBeenCalled();
  });

  it('prepares a stable AI question plan for interviewer training in one call', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateInterviewerPlan: vi.fn().mockResolvedValue({
        questions: [
          'Расскажите о самом сложном интерфейсе, который вы реализовали?',
          'Как вы диагностируете проблемы производительности?',
          'Как вы принимаете архитектурные решения в команде?',
        ],
      }),
      generateQuestion: vi.fn(),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };
    const service = new InterviewService({ repository, engine, hhClient: null });

    const state = await service.createSession({
      anonymousSessionId: 'anon_planned_interviewer',
      input: {
        trainingMode: 'interviewer',
        source: { type: 'profession', role: 'Frontend-разработчик' },
        questionSourceMode: 'glasno',
        focus: 'professional',
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    expect(engine.generateInterviewerPlan).toHaveBeenCalledWith(
      expect.objectContaining({ focus: 'professional' })
    );
    expect(engine.generateQuestion).not.toHaveBeenCalled();
    expect(state.session.plan.items.map((item) => item.question)).toEqual([
      'Расскажите о самом сложном интерфейсе, который вы реализовали?',
      'Как вы диагностируете проблемы производительности?',
      'Как вы принимаете архитектурные решения в команде?',
    ]);
    // Интервью непрерывное: план остаётся справочником, а разговор идёт
    // в одном этапе, без пошагового перехода по пунктам.
    expect(state.currentTurn?.question).toBe('Интервью по плану');
    expect(state.turns).toHaveLength(1);
  });

  it('keeps the interviewer interview in a single continuous turn', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateInterviewerPlan: vi.fn().mockResolvedValue({
        questions: ['Первый вопрос?', 'Второй вопрос?', 'Третий вопрос?'],
      }),
      generateQuestion: vi.fn(),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };
    const service = new InterviewService({ repository, engine, hhClient: null });

    const state = await service.createSession({
      anonymousSessionId: 'anon_continuous_interviewer',
      input: {
        trainingMode: 'interviewer',
        source: { type: 'profession', role: 'Frontend-разработчик' },
        questionSourceMode: 'glasno',
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    const turnId = state.currentTurn!.id;

    await expect(
      service.nextQuestion({
        anonymousSessionId: 'anon_continuous_interviewer',
        sessionId: state.session.id,
        input: { turnId },
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    const finished = await service.finishInterview({
      anonymousSessionId: 'anon_continuous_interviewer',
      sessionId: state.session.id,
      input: { turnId },
    });

    expect(finished.session.status).toBe('done');
    expect(finished.turns).toHaveLength(1);
  });

  it('rejects an incomplete or non-unique generated interviewer plan', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      generateInterviewerPlan: vi.fn().mockResolvedValue({
        questions: [
          'Расскажите о самом сложном проекте?',
          'Расскажите о самом сложном проекте?',
          'Как вы проверяете качество решения?',
        ],
      }),
    };
    const service = new InterviewService({
      repository,
      engine: engine as never,
      hhClient: null,
    });

    await expect(
      service.createSession({
        anonymousSessionId: 'anon_incomplete_plan',
        input: {
          trainingMode: 'interviewer',
          source: { type: 'profession', role: 'Frontend-разработчик' },
          questionSourceMode: 'glasno',
          level: 'middle',
          sessionGoal: 'quick',
          responseMode: 'text',
          hintMode: 'off',
          language: 'ru',
          interviewerMode: 'neutral',
          interviewerAvatarId: 'neutral-pro',
        },
      })
    ).rejects.toThrow('полный план интервью');
    expect(repository.sessions).toHaveLength(0);
  });

  it('updates interviewer gender and tone together from the selected face', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Расскажите о вашем опыте.' }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };
    const service = new InterviewService({ repository, engine, hhClient: null });
    const created = await service.createSession({
      anonymousSessionId: 'anon_interviewer_settings',
      input: {
        source: { type: 'profession', role: 'Frontend-разработчик' },
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    const state = await service.updateInterviewer({
      anonymousSessionId: 'anon_interviewer_settings',
      sessionId: created.session.id,
      input: { faceId: 'female-strict' },
    });

    expect(state.session).toMatchObject({
      interviewerFaceId: 'female-strict',
      interviewerMode: 'strict',
      interviewerAvatarId: 'strict-lead',
    });
  });

  it('appends realtime dialogue messages to the current turn without generating a reply', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Как вы ищете новых клиентов?' }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };

    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const created = await service.createSession({
      anonymousSessionId: 'anon_1',
      input: {
        source: { type: 'profession', role: 'Менеджер по продажам' },
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'realtime',
        hintMode: 'realtime',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    const state = await service.appendTurnMessage({
      anonymousSessionId: 'anon_1',
      sessionId: created.session.id,
      input: {
        turnId: created.currentTurn!.id,
        role: 'user',
        content: 'В realtime я рассказал про холодные письма.',
      },
    });

    expect(engine.converse).not.toHaveBeenCalled();
    expect(state.currentTurn?.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'В realtime я рассказал про холодные письма.',
      }),
    ]);
    expect(state.currentTurn?.questionPacingStartedAt).toBeTruthy();
  });

  it('records a realtime timebox reminder without moving to the next question', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T10:08:00.000Z'));
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Как вы ищете новых клиентов?' }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };
    const service = new InterviewService({ repository, engine, hhClient: null });
    const created = await service.createSession({
      anonymousSessionId: 'anon_realtime_timebox',
      input: {
        source: { type: 'profession', role: 'Менеджер по продажам' },
        level: 'middle',
        sessionGoal: 'standard',
        responseMode: 'realtime',
        hintMode: 'realtime',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });
    const turn = repository.turns.find(
      (item) => item.id === created.currentTurn!.id
    );
    turn.metadata = {
      ...turn.metadata,
      questionPacingStartedAt: '2026-07-13T10:00:00.000Z',
    };

    const state = await service.appendTurnMessage({
      anonymousSessionId: 'anon_realtime_timebox',
      sessionId: created.session.id,
      input: {
        turnId: created.currentTurn!.id,
        role: 'interviewer',
        content: 'Предлагаю перейти к следующему вопросу. Готовы?',
        timeboxReminder: true,
      },
    });

    expect(state.currentTurn).toMatchObject({
      questionPacingLastReminderAt: '2026-07-13T10:08:00.000Z',
    });
    expect(state.session.currentQuestionIndex).toBe(1);
    vi.useRealTimers();
  });

  it('adds a timebox instruction only after the current question exceeds its limit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T10:08:00.000Z'));
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn().mockResolvedValue({
        reply: 'Предлагаю перейти к следующему вопросу. Готовы?',
        suggestMoveOn: true,
      }),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Как вы строите продажи?' }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };
    const service = new InterviewService({ repository, engine, hhClient: null });

    const created = await service.createSession({
      anonymousSessionId: 'anon_timebox',
      input: {
        source: { type: 'profession', role: 'Менеджер по продажам' },
        level: 'middle',
        sessionGoal: 'standard',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });
    const turn = repository.turns.find(
      (item) => item.id === created.currentTurn!.id
    );
    turn.metadata = {
      ...turn.metadata,
      questionPacingStartedAt: '2026-07-13T10:00:00.000Z',
    };

    const state = await service.replyTurn({
      anonymousSessionId: 'anon_timebox',
      sessionId: created.session.id,
      input: { turnId: created.currentTurn!.id, message: 'Я сегментирую базу.' },
    });

    expect(engine.converse).toHaveBeenCalledWith(
      expect.objectContaining({ timeboxReminder: true })
    );
    expect(state.currentTurn).toMatchObject({
      suggestMoveOn: true,
      questionPacingStartedAt: '2026-07-13T10:00:00.000Z',
      questionPacingLastReminderAt: '2026-07-13T10:08:00.000Z',
    });
    vi.useRealTimers();
  });

  it('never lets the AI-candidate or timebox control interviewer-training transitions', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn().mockResolvedValue({
        reply: 'Я готов ответить на следующий вопрос.',
        suggestMoveOn: true,
      }),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Начните интервью с кандидатом.' }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };
    const service = new InterviewService({ repository, engine, hhClient: null });
    const created = await service.createSession({
      anonymousSessionId: 'anon_interviewer_transition',
      input: {
        trainingMode: 'interviewer',
        source: { type: 'profession', role: 'Frontend-разработчик' },
        resumeText: 'Frontend-разработчик, четыре года опыта.',
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    const state = await service.replyTurn({
      anonymousSessionId: 'anon_interviewer_transition',
      sessionId: created.session.id,
      input: {
        turnId: created.currentTurn!.id,
        message: 'Расскажите о вашем последнем проекте.',
      },
    });

    expect(engine.converse).toHaveBeenCalledWith(
      expect.objectContaining({ timeboxReminder: false })
    );
    expect(state.currentTurn?.suggestMoveOn).toBe(false);
  });

  it('does not evaluate interviewer speech as a candidate answer', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValueOnce({ question: 'Начните интервью.' })
        .mockResolvedValueOnce({ question: 'Продолжите интервью.' }),
      evaluateAnswer: vi.fn().mockResolvedValue({
        needsClarification: true,
        question: 'Ошибочное уточнение от AI-интервьюера?',
      }),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };
    const service = new InterviewService({ repository, engine, hhClient: null });
    const created = await service.createSession({
      anonymousSessionId: 'anon_interviewer_answer',
      input: {
        trainingMode: 'interviewer',
        source: { type: 'profession', role: 'Frontend-разработчик' },
        resumeText: 'Frontend-разработчик, четыре года опыта.',
        level: 'middle',
        questionCount: 3,
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    await service.answerTurn({
      anonymousSessionId: 'anon_interviewer_answer',
      sessionId: created.session.id,
      input: {
        turnId: created.currentTurn!.id,
        answer: 'Расскажите подробно о вашем последнем проекте и вашей роли.',
      },
    });

    expect(engine.evaluateAnswer).not.toHaveBeenCalled();
  });

  it('deletes only an owned interview session', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(),
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Как вы готовитесь к интервью?' }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };
    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const created = await service.createSession({
      anonymousSessionId: 'anon_owner',
      userId: 'user_owner',
      input: {
        source: { type: 'profession', role: 'Product Manager' },
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    await expect(
      service.deleteSession({
        anonymousSessionId: 'anon_other',
        userId: 'user_other',
        sessionId: created.session.id,
      })
    ).rejects.toMatchObject({ data: { code: 'E_FORBIDDEN' } });

    await expect(
      service.deleteSession({
        anonymousSessionId: 'anon_owner',
        userId: 'user_owner',
        sessionId: created.session.id,
      })
    ).resolves.toEqual({ ok: true });
    expect(repository.sessions).toHaveLength(0);
    expect(repository.turns).toHaveLength(0);
  });

  it('streams interviewer reply deltas before returning the final interview state', async () => {
    const repository = createInMemoryRepository();
    async function* converseStream() {
      yield 'Хорошо, ';
      yield 'продолжайте.';
      return { suggestMoveOn: true };
    }
    const engine = {
      converse: vi.fn(),
      converseStream: vi.fn(converseStream),
      normalizeCustomQuestions: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Как вы работаете с приоритетами?' }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };

    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const created = await service.createSession({
      anonymousSessionId: 'anon_1',
      input: {
        source: { type: 'profession', role: 'Project Manager' },
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });

    const chunks = [];
    for await (const chunk of service.replyTurnStream({
      anonymousSessionId: 'anon_1',
      sessionId: created.session.id,
      input: {
        turnId: created.currentTurn!.id,
        message: 'Я сначала оцениваю влияние и срочность.',
      },
    })) {
      chunks.push(chunk);
    }

    expect(chunks[0]).toEqual({ type: 'delta', text: 'Хорошо, ' });
    expect(chunks[1]).toEqual({ type: 'delta', text: 'продолжайте.' });
    const doneChunk = chunks[2];
    expect(doneChunk).toMatchObject({ type: 'done' });
    if (!doneChunk || doneChunk.type !== 'done') {
      throw new Error('Expected final stream chunk with interview state');
    }
    expect(doneChunk.state.currentTurn?.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Я сначала оцениваю влияние и срочность.',
      }),
      expect.objectContaining({
        role: 'interviewer',
        content: 'Хорошо, продолжайте.',
      }),
    ]);
    expect(doneChunk.state.currentTurn?.suggestMoveOn).toBe(true);
  });

  it('asks one clarification after a shallow answer and then moves to the next main question', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      normalizeCustomQuestions: vi.fn(),
      converse: vi.fn(),
      converseStream: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValueOnce({ question: 'Расскажите о сложной задаче.' })
        .mockResolvedValueOnce({ question: 'Как вы работаете с конфликтами?' }),
      evaluateAnswer: vi.fn().mockResolvedValue({
        needsClarification: true,
        question: 'Какой конкретный результат вы получили?',
      }),
      generateQuestionHints: vi.fn(),
      generateSampleAnswerHint: vi.fn(),
    };

    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const created = await service.createSession({
      anonymousSessionId: 'anon_1',
      input: {
        source: { type: 'profession', role: 'Операционный менеджер' },
        level: 'senior',
        questionCount: 3,
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'strict',
        interviewerAvatarId: 'strict-lead',
      },
    });

    const afterMainAnswer = await service.answerTurn({
      anonymousSessionId: 'anon_1',
      sessionId: created.session.id,
      input: {
        turnId: created.currentTurn!.id,
        answer:
          'Я разобрался с процессом, договорился с коллегами и в итоге решил задачу хорошо для команды.',
      },
    });

    expect(afterMainAnswer.currentTurn).toMatchObject({
      kind: 'clarification',
      index: 1,
      question: 'Какой конкретный результат вы получили?',
      followUpForTurnId: created.currentTurn!.id,
    });

    const afterClarification = await service.answerTurn({
      anonymousSessionId: 'anon_1',
      sessionId: created.session.id,
      input: {
        turnId: afterMainAnswer.currentTurn!.id,
        answer: 'Сократил срок обработки заявок на 18% за квартал.',
      },
    });

    expect(afterClarification.currentTurn).toMatchObject({
      kind: 'main',
      index: 2,
      question: 'Как вы работаете с конфликтами?',
    });
    expect(engine.evaluateAnswer).toHaveBeenCalledOnce();
  });

  it('generates detailed hints once and preserves existing turn metadata', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      normalizeCustomQuestions: vi.fn(),
      converse: vi.fn(),
      converseStream: vi.fn(),
      generateQuestion: vi.fn().mockResolvedValue({
        question:
          'Как вы оцениваете влияние TypeScript на улучшение качества кода?',
      }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn().mockResolvedValue({
        focus: 'Проверяет понимание практической пользы TypeScript.',
        answerPlan: [
          'Дать короткое определение TypeScript.',
          'Связать типизацию с ранним обнаружением ошибок.',
          'Показать пользу для рефакторинга и командной разработки.',
        ],
        keyDefinitions: [
          'TypeScript — расширение JavaScript со статической типизацией.',
        ],
        sampleAnswer:
          'Я бы сказал, что TypeScript помогает находить часть ошибок до запуска кода.',
      }),
      generateSampleAnswerHint: vi.fn(),
    };

    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const created = await service.createSession({
      anonymousSessionId: 'anon_1',
      input: {
        source: { type: 'profession', role: 'Frontend-разработчик' },
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });
    const turnId = created.currentTurn!.id;
    const turn = repository.turns.find((item) => item.id === turnId);
    turn.metadata = {
      ...turn.metadata,
      dialogue: [
        {
          role: 'user',
          content: 'Я думаю про надёжность.',
          at: '2026-06-28T10:02:00.000Z',
        },
      ],
      suggestMoveOn: true,
    };

    const first = await service.generateTurnHints({
      anonymousSessionId: 'anon_1',
      sessionId: created.session.id,
      input: { turnId },
    });
    const second = await service.generateTurnHints({
      anonymousSessionId: 'anon_1',
      sessionId: created.session.id,
      input: { turnId },
    });

    expect(engine.generateQuestionHints).toHaveBeenCalledOnce();
    expect(first.currentTurn?.hintPack?.detailed).toMatchObject({
      focus: 'Проверяет понимание практической пользы TypeScript.',
    });
    expect(second.currentTurn?.hintPack?.detailed?.answerPlan).toHaveLength(3);
    expect(second.currentTurn?.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Я думаю про надёжность.',
      }),
    ]);
    expect(second.currentTurn?.suggestMoveOn).toBe(true);
  });

  it('updates only the candidate answer example when interviewer asks a follow-up inside the same turn', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      normalizeCustomQuestions: vi.fn(),
      converse: vi.fn(),
      converseStream: vi.fn(),
      generateQuestion: vi.fn().mockResolvedValue({
        question:
          'Как вы оцениваете влияние TypeScript на улучшение качества кода?',
      }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateHintExample: vi.fn().mockResolvedValue({
        kind: 'candidate_answer',
        context:
          'А как вы оцениваете влияние TypeScript на скорость разработки и обучение новых членов команды?',
        text:
          'Я бы ответил, что скорость разработки сначала может немного снижаться из-за обучения, но затем растёт за счёт автодополнения, понятных контрактов и более безопасного рефакторинга.',
      }),
    };

    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const created = await service.createSession({
      anonymousSessionId: 'anon_1',
      input: {
        source: { type: 'profession', role: 'Frontend-разработчик' },
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });
    const turnId = created.currentTurn!.id;
    const turn = repository.turns.find((item) => item.id === turnId);
    const originalQuestion = turn.question;
    turn.metadata = {
      ...turn.metadata,
      hintPack: {
        ...turn.metadata.hintPack,
        detailed: {
          focus: 'Проверяет понимание практической пользы TypeScript.',
          answerPlan: [
            'Объяснить статическую типизацию.',
            'Связать типы с ранним поиском ошибок.',
            'Показать влияние на поддержку проекта.',
          ],
          keyDefinitions: [
            'TypeScript — расширение JavaScript со статической типизацией.',
          ],
          sampleAnswerQuestion: originalQuestion,
          sampleAnswer:
            'Я бы сказал, что TypeScript помогает находить часть ошибок до запуска кода.',
        },
      },
      dialogue: [
        {
          role: 'user',
          content: 'Он помогает находить ошибки раньше.',
          at: '2026-06-28T10:02:00.000Z',
        },
        {
          role: 'interviewer',
          content:
            'А как вы оцениваете влияние TypeScript на скорость разработки и обучение новых членов команды?',
          at: '2026-06-28T10:03:00.000Z',
        },
      ],
      suggestMoveOn: false,
    };

    const first = await service.generateTurnHints({
      anonymousSessionId: 'anon_1',
      sessionId: created.session.id,
      input: { turnId },
    });
    const second = await service.generateTurnHints({
      anonymousSessionId: 'anon_1',
      sessionId: created.session.id,
      input: { turnId },
    });

    expect(engine.generateQuestionHints).not.toHaveBeenCalled();
    expect(engine.generateHintExample).toHaveBeenCalledOnce();
    expect(engine.generateHintExample).toHaveBeenCalledWith(
      expect.objectContaining({
        exampleContext:
          'А как вы оцениваете влияние TypeScript на скорость разработки и обучение новых членов команды?',
      })
    );
    expect(first.currentTurn?.hintPack?.detailed).toMatchObject({
      focus: 'Проверяет понимание практической пользы TypeScript.',
      answerPlan: [
        'Объяснить статическую типизацию.',
        'Связать типы с ранним поиском ошибок.',
        'Показать влияние на поддержку проекта.',
      ],
      example: {
        kind: 'candidate_answer',
        context:
          'А как вы оцениваете влияние TypeScript на скорость разработки и обучение новых членов команды?',
        text:
          'Я бы ответил, что скорость разработки сначала может немного снижаться из-за обучения, но затем растёт за счёт автодополнения, понятных контрактов и более безопасного рефакторинга.',
      },
    });
    expect(second.currentTurn?.messages).toHaveLength(2);
    expect(engine.generateHintExample).toHaveBeenCalledOnce();
  });

  it('refreshes the whole interviewer hint block after an AI-candidate reply', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      normalizeCustomQuestions: vi.fn().mockResolvedValue({
        questions: ['Расскажите о выбранном технологическом стеке?'],
      }),
      converse: vi.fn(),
      converseStream: vi.fn(),
      generateQuestion: vi.fn(),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi
        .fn()
        .mockResolvedValueOnce({
          focus: 'Проверяет реальный вклад в техническое решение.',
          answerPlan: ['Спросить о задаче.', 'Уточнить личный вклад.'],
          keyDefinitions: [],
          example: {
            kind: 'interviewer_question',
            context: 'Расскажите о выбранном технологическом стеке?',
            text: 'Какую задачу вы решали с помощью этого стека?',
            followUps: ['Как лично выбирали решение?'],
          },
        })
        .mockResolvedValueOnce({
          focus: 'Проверяет, что именно кандидат сделал сам.',
          answerPlan: ['Уточнить личный вклад в выбор стека.'],
          keyDefinitions: [],
          example: {
            kind: 'interviewer_question',
            context:
              'В проекте мы использовали React и TypeScript, чтобы безопаснее менять интерфейс.',
            text: 'Какую часть этого решения вы реализовали лично?',
            followUps: ['Как проверяли, что решение сработало?'],
          },
        }),
      generateSampleAnswerHint: vi.fn(),
      generateHintExample: vi.fn(),
    };
    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const created = await service.createSession({
      anonymousSessionId: 'anon_interviewer_hints',
      input: {
        trainingMode: 'interviewer',
        source: { type: 'profession', role: 'Frontend-разработчик' },
        questionSourceMode: 'custom',
        customQuestionsText:
          'Расскажите о выбранном технологическом стеке?',
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });
    const turnId = created.currentTurn!.id;

    await service.generateTurnHints({
      anonymousSessionId: 'anon_interviewer_hints',
      sessionId: created.session.id,
      input: { turnId },
    });

    const turn = repository.turns.find((item) => item.id === turnId);
    turn.metadata = {
      ...turn.metadata,
      dialogue: [
        {
          role: 'interviewer',
          content:
            'В проекте мы использовали React и TypeScript, чтобы безопаснее менять интерфейс.',
          at: '2026-07-14T10:10:00.000Z',
        },
      ],
    };

    const refreshed = await service.generateTurnHints({
      anonymousSessionId: 'anon_interviewer_hints',
      sessionId: created.session.id,
      input: { turnId },
    });

    // Один совмещённый запрос обновляет и «что проверить дальше», и пример:
    // отдельного вызова за примером в непрерывном интервью больше нет.
    expect(engine.generateHintExample).not.toHaveBeenCalled();
    expect(engine.generateQuestionHints).toHaveBeenCalledTimes(2);
    expect(engine.generateQuestionHints).toHaveBeenLastCalledWith(
      expect.objectContaining({
        exampleContext:
          'В проекте мы использовали React и TypeScript, чтобы безопаснее менять интерфейс.',
      })
    );

    const detailed = refreshed.currentTurn?.hintPack?.detailed as any;
    expect(detailed?.focus).toBe('Проверяет, что именно кандидат сделал сам.');
    expect(detailed?.answerPlan).toEqual([
      'Уточнить личный вклад в выбор стека.',
    ]);
    expect(detailed?.example).toMatchObject({
      kind: 'interviewer_question',
      text: 'Какую часть этого решения вы реализовали лично?',
    });
  });

  it('keeps the last successful interviewer hints when the engine fails', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      normalizeCustomQuestions: vi.fn().mockResolvedValue({
        questions: ['Расскажите о выбранном технологическом стеке?'],
      }),
      converse: vi.fn(),
      converseStream: vi.fn(),
      generateQuestion: vi.fn(),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi
        .fn()
        .mockResolvedValueOnce({
          focus: 'Проверяет реальный вклад в техническое решение.',
          answerPlan: ['Спросить о задаче.'],
          keyDefinitions: [],
          example: {
            kind: 'interviewer_question',
            context: 'Расскажите о выбранном технологическом стеке?',
            text: 'Какую задачу вы решали с помощью этого стека?',
            followUps: [],
          },
        })
        .mockRejectedValueOnce(new Error('upstream is down')),
      generateSampleAnswerHint: vi.fn(),
      generateHintExample: vi.fn(),
    };
    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const created = await service.createSession({
      anonymousSessionId: 'anon_interviewer_hints_fail',
      input: {
        trainingMode: 'interviewer',
        source: { type: 'profession', role: 'Frontend-разработчик' },
        questionSourceMode: 'custom',
        customQuestionsText: 'Расскажите о выбранном технологическом стеке?',
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });
    const turnId = created.currentTurn!.id;

    await service.generateTurnHints({
      anonymousSessionId: 'anon_interviewer_hints_fail',
      sessionId: created.session.id,
      input: { turnId },
    });

    const turn = repository.turns.find((item) => item.id === turnId);
    turn.metadata = {
      ...turn.metadata,
      dialogue: [
        {
          role: 'interviewer',
          content: 'Мы выбрали React и TypeScript ради безопасности изменений.',
          at: '2026-07-14T10:10:00.000Z',
        },
      ],
    };

    await expect(
      service.generateTurnHints({
        anonymousSessionId: 'anon_interviewer_hints_fail',
        sessionId: created.session.id,
        input: { turnId },
      })
    ).rejects.toThrow();

    // Ошибка движка не должна затирать последнюю успешную подсказку.
    const stored = repository.turns.find((item) => item.id === turnId);
    expect(stored.metadata.hintPack.detailed.example.text).toBe(
      'Какую задачу вы решали с помощью этого стека?'
    );
  });

  it('does not refresh a legacy candidate answer for a move-on prompt', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      normalizeCustomQuestions: vi.fn(),
      converse: vi.fn(),
      converseStream: vi.fn(),
      generateQuestion: vi.fn().mockResolvedValue({
        question: 'Расскажите про TypeScript.',
      }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn(),
      generateHintExample: vi.fn(),
    };

    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const created = await service.createSession({
      anonymousSessionId: 'anon_1',
      input: {
        source: { type: 'profession', role: 'Frontend-разработчик' },
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });
    const turnId = created.currentTurn!.id;
    const turn = repository.turns.find((item) => item.id === turnId);
    turn.metadata = {
      ...turn.metadata,
      hintPack: {
        ...turn.metadata.hintPack,
        detailed: {
          focus: 'Проверяет понимание TypeScript.',
          answerPlan: ['Определить TypeScript.', 'Назвать пользу типов.'],
          keyDefinitions: [],
          sampleAnswerQuestion: turn.question,
          sampleAnswer: 'Я бы ответил про статическую типизацию.',
        },
      },
      dialogue: [
        {
          role: 'interviewer',
          content: 'Хорошо, здесь понятно. Готовы перейти к следующему вопросу?',
          at: '2026-06-28T10:03:00.000Z',
        },
      ],
      suggestMoveOn: true,
    };

    const state = await service.generateTurnHints({
      anonymousSessionId: 'anon_1',
      sessionId: created.session.id,
      input: { turnId },
    });

    expect(engine.generateHintExample).not.toHaveBeenCalled();
    expect(state.currentTurn?.hintPack?.detailed?.sampleAnswer).toBe(
      'Я бы ответил про статическую типизацию.'
    );
  });

  it('builds base and detailed hints for clarification turns without a hint pack', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      normalizeCustomQuestions: vi.fn(),
      converse: vi.fn(),
      converseStream: vi.fn(),
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Расскажите о проекте.' }),
      evaluateAnswer: vi.fn(),
      generateQuestionHints: vi.fn().mockResolvedValue({
        focus: 'Проверяет, умеет ли кандидат уточнять результат.',
        answerPlan: [
          'Назвать исходную проблему.',
          'Показать личное действие.',
          'Закончить измеримым итогом.',
        ],
        keyDefinitions: ['Измеримый итог — число, срок, масштаб или вывод.'],
        sampleAnswer:
          'Я бы уточнил результат через конкретный эффект для команды.',
      }),
      generateSampleAnswerHint: vi.fn(),
    };

    const service = new InterviewService({
      repository,
      engine,
      hhClient: null,
    });

    const created = await service.createSession({
      anonymousSessionId: 'anon_1',
      input: {
        source: { type: 'profession', role: 'Project manager' },
        level: 'middle',
        sessionGoal: 'quick',
        responseMode: 'text',
        hintMode: 'off',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
    });
    const clarification = await repository.createTurn({
      sessionId: created.session.id,
      index: 1,
      kind: 'clarification',
      question: 'Какой конкретный результат вы получили?',
      followUpForTurnId: created.currentTurn!.id,
      metadata: null,
    });

    const state = await service.generateTurnHints({
      anonymousSessionId: 'anon_1',
      sessionId: created.session.id,
      input: { turnId: clarification.id },
    });
    const hintedClarification = state.turns.find(
      (turn) => turn.id === clarification.id
    );

    expect(hintedClarification?.hintPack?.structure).toContain('результат');
    expect(hintedClarification?.hintPack?.detailed?.example).toMatchObject({
      kind: 'candidate_answer',
      text: expect.stringContaining('конкретный эффект'),
    });
  });

  describe('бюджет активного времени бесплатной сессии', () => {
    // Диалог, в котором активного времени заведомо больше 20 минут.
    function exhaustedDialogue() {
      const base = Date.parse('2026-07-22T10:00:00.000Z');
      return Array.from({ length: 60 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'interviewer',
        content: `реплика ${index + 1}`,
        at: new Date(base + index * 45_000).toISOString(),
      }));
    }

    async function createSessionWith(options: {
      isTrialSession?: boolean;
      hasPaidAccess?: () => Promise<boolean>;
    }) {
      const repository = createInMemoryRepository();
      const converse = vi
        .fn()
        .mockResolvedValue({ reply: 'Ответ кандидата.', suggestMoveOn: false });
      const engine = {
        normalizeCustomQuestions: vi.fn(),
        converse,
        converseStream: vi.fn(),
        generateQuestion: vi
          .fn()
          .mockResolvedValue({ question: 'Расскажите о проекте?' }),
        evaluateAnswer: vi.fn(),
        generateQuestionHints: vi.fn(),
        generateSampleAnswerHint: vi.fn(),
      };
      const service = new InterviewService({
        repository,
        engine,
        hhClient: null,
        ...(options.hasPaidAccess
          ? { hasPaidAccess: options.hasPaidAccess }
          : {}),
      });

      const created = await service.createSession({
        anonymousSessionId: 'anon_limit',
        input: {
          trainingMode: 'candidate',
          source: { type: 'profession', role: 'Frontend-разработчик' },
          questionSourceMode: 'glasno',
          level: 'middle',
          sessionGoal: 'quick',
          responseMode: 'text',
          hintMode: 'off',
          language: 'ru',
          interviewerMode: 'neutral',
          interviewerAvatarId: 'neutral-pro',
        },
        isTrialSession: options.isTrialSession,
      });

      const turnId = created.currentTurn!.id;
      const turn = repository.turns.find((item: any) => item.id === turnId);
      turn.metadata = { ...turn.metadata, dialogue: exhaustedDialogue() };

      return { service, repository, engine, converse, turnId };
    }

    it('мягко завершает интервью и не тратит запрос к модели', async () => {
      const { service, repository, converse, turnId } = await createSessionWith({
        isTrialSession: true,
      });

      const state = await service.replyTurn({
        anonymousSessionId: 'anon_limit',
        sessionId: 'session_1',
        input: { turnId, message: 'Ещё один вопрос, пожалуйста.' },
      });

      expect(converse).not.toHaveBeenCalled();
      expect(state.session.status).toBe('done');

      // Реплика пользователя не теряется — она попадёт в отчёт.
      const turn = repository.turns.find((item: any) => item.id === turnId);
      expect(turn.metadata.dialogue.at(-1)).toMatchObject({
        role: 'user',
        content: 'Ещё один вопрос, пожалуйста.',
      });
      expect(turn.answerTranscript).toContain('Ещё один вопрос, пожалуйста.');
    });

    it('не ограничивает сессию с платным доступом', async () => {
      const { service, converse, turnId } = await createSessionWith({
        isTrialSession: false,
      });

      const state = await service.replyTurn({
        anonymousSessionId: 'anon_limit',
        sessionId: 'session_1',
        input: { turnId, message: 'Продолжаем разговор.' },
      });

      expect(converse).toHaveBeenCalledTimes(1);
      expect(state.session.status).toBe('running');
    });

    it('снимает лимит, если доступ оплатили во время интервью', async () => {
      const hasPaidAccess = vi.fn().mockResolvedValue(true);
      const { service, repository, converse, turnId } = await createSessionWith({
        isTrialSession: true,
        hasPaidAccess,
      });

      const state = await service.replyTurn({
        anonymousSessionId: 'anon_limit',
        sessionId: 'session_1',
        input: { turnId, message: 'Я оплатил доступ, продолжаем.' },
      });

      expect(hasPaidAccess).toHaveBeenCalledTimes(1);
      expect(converse).toHaveBeenCalledTimes(1);
      expect(state.session.status).toBe('running');
      // Флаг снят, чтобы биллинг больше не дёргался на каждой реплике.
      expect(repository.sessions[0].metadata.trialSession).toBeUndefined();
    });

    it('не трогает биллинг, пока бюджет не исчерпан', async () => {
      const hasPaidAccess = vi.fn().mockResolvedValue(false);
      const repository = createInMemoryRepository();
      const converse = vi
        .fn()
        .mockResolvedValue({ reply: 'Ответ.', suggestMoveOn: false });
      const service = new InterviewService({
        repository,
        engine: {
          normalizeCustomQuestions: vi.fn(),
          converse,
          converseStream: vi.fn(),
          generateQuestion: vi
            .fn()
            .mockResolvedValue({ question: 'Расскажите о проекте?' }),
          evaluateAnswer: vi.fn(),
          generateQuestionHints: vi.fn(),
        },
        hhClient: null,
        hasPaidAccess,
      });

      const created = await service.createSession({
        anonymousSessionId: 'anon_fresh',
        input: {
          trainingMode: 'candidate',
          source: { type: 'profession', role: 'Frontend-разработчик' },
          questionSourceMode: 'glasno',
          level: 'middle',
          sessionGoal: 'quick',
          responseMode: 'text',
          hintMode: 'off',
          language: 'ru',
          interviewerMode: 'neutral',
          interviewerAvatarId: 'neutral-pro',
        },
        isTrialSession: true,
      });

      await service.replyTurn({
        anonymousSessionId: 'anon_fresh',
        sessionId: 'session_1',
        input: { turnId: created.currentTurn!.id, message: 'Первый вопрос.' },
      });

      expect(hasPaidAccess).not.toHaveBeenCalled();
      expect(converse).toHaveBeenCalledTimes(1);
    });
  });
});
