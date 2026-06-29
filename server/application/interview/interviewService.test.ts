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
  };
}

describe('InterviewService', () => {
  it('creates a running anonymous interview session with the first question', async () => {
    const repository = createInMemoryRepository();
    const engine = {
      generateQuestion: vi
        .fn()
        .mockResolvedValue({ question: 'Расскажите о релевантном опыте.' }),
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

  it('asks one clarification after a shallow answer and then moves to the next main question', async () => {
    const repository = createInMemoryRepository();
    const engine = {
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
