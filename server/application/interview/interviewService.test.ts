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
    expect(chunks[2]).toMatchObject({ type: 'done' });
    expect(chunks[2].state.currentTurn?.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Я сначала оцениваю влияние и срочность.',
      }),
      expect.objectContaining({
        role: 'interviewer',
        content: 'Хорошо, продолжайте.',
      }),
    ]);
    expect(chunks[2].state.currentTurn?.suggestMoveOn).toBe(true);
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
});
