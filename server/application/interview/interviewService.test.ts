import { describe, expect, it, vi } from 'vitest';
import { InterviewService } from './interviewService';

function createInMemoryRepository() {
  const sessions: any[] = [];
  const turns: any[] = [];

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
    async updateSessionInterviewer(id: string, fields: any) {
      const session = sessions.find((item) => item.id === id);
      if (!session) return null;
      session.interviewerMode = fields.interviewerMode;
      session.interviewerAvatarId = fields.interviewerAvatarId;
      session.metadata = fields.metadata;
      return session;
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

  it('updates only the sample answer when interviewer asks a follow-up inside the same turn', async () => {
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
      generateSampleAnswerHint: vi.fn().mockResolvedValue({
        sampleAnswer:
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
    expect(engine.generateSampleAnswerHint).toHaveBeenCalledOnce();
    expect(engine.generateSampleAnswerHint).toHaveBeenCalledWith(
      expect.objectContaining({
        targetQuestion:
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
      sampleAnswerQuestion:
        'А как вы оцениваете влияние TypeScript на скорость разработки и обучение новых членов команды?',
      sampleAnswer:
        'Я бы ответил, что скорость разработки сначала может немного снижаться из-за обучения, но затем растёт за счёт автодополнения, понятных контрактов и более безопасного рефакторинга.',
    });
    expect(second.currentTurn?.messages).toHaveLength(2);
    expect(engine.generateSampleAnswerHint).toHaveBeenCalledOnce();
  });

  it('does not refresh the sample answer for a move-on prompt', async () => {
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

    expect(engine.generateSampleAnswerHint).not.toHaveBeenCalled();
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
    expect(hintedClarification?.hintPack?.detailed?.sampleAnswer).toContain(
      'конкретный эффект'
    );
  });
});
