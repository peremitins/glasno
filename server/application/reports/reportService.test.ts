import { describe, expect, it, vi } from 'vitest';
import { ReportService } from './reportService';

function createInterviewRepository(
  sessionOverrides: Record<string, unknown>,
  turnOverrides: Record<string, unknown> | Array<Record<string, unknown>> = {}
) {
  const session = {
    id: 'session_1',
    anonymousSessionId: 'anon_1',
    userId: null,
    source: 'text',
    vacancyTitle: 'Менеджер по продажам',
    vacancyRaw: 'B2B продажи, CRM, переговоры',
    vacancyUrl: null,
    companyName: 'Ромашка',
    resumeRaw: '5 лет в B2B продажах',
    role: 'Менеджер по продажам',
    level: 'middle',
    questionCount: 3,
    language: 'ru',
    interviewerMode: 'neutral',
    interviewerAvatarId: 'neutral-pro',
    status: 'done',
    createdAt: new Date('2026-06-28T10:00:00.000Z'),
    ...sessionOverrides,
  };
  const baseTurn = {
    id: 'turn_1',
    sessionId: 'session_1',
    index: 1,
    kind: 'main',
    question: 'Как вы ищете новых B2B-клиентов?',
    answerTranscript: 'Через холодные письма и партнёрские рекомендации.',
    followUpForTurnId: null,
    metadata: null,
    answeredAt: new Date('2026-06-28T10:05:00.000Z'),
    createdAt: new Date('2026-06-28T10:01:00.000Z'),
  };
  const turns = (
    Array.isArray(turnOverrides) ? turnOverrides : [turnOverrides]
  ).map((overrides, index) => ({
    ...baseTurn,
    id: `turn_${index + 1}`,
    index: index + 1,
    question: `Вопрос ${index + 1}?`,
    ...overrides,
  }));

  return {
    async findSessionById(id: string) {
      return id === session.id ? session : null;
    },
    async listTurns(id: string) {
      return id === session.id ? turns : [];
    },
  };
}

function createReportRepository() {
  const reports: any[] = [];
  return {
    reports,
    async findBySessionId(sessionId: string) {
      return reports.find((report) => report.sessionId === sessionId) ?? null;
    },
    async findById(id: string) {
      return reports.find((report) => report.id === id) ?? null;
    },
    async createQueued(sessionId: string) {
      const report = {
        id: `report_${reports.length + 1}`,
        sessionId,
        status: 'queued',
        overallScore: null,
        criteria: null,
        recommendations: null,
        questionAnalysis: null,
        verdict: null,
        summary: null,
        errorMessage: null,
        model: null,
        createdAt: new Date('2026-06-28T10:10:00.000Z'),
        updatedAt: new Date('2026-06-28T10:10:00.000Z'),
      };
      reports.push(report);
      return report;
    },
    async markProcessing(id: string) {
      const report = reports.find((item) => item.id === id);
      report.status = 'processing';
      return report;
    },
    async saveCompleted(id: string, analysis: any) {
      const report = reports.find((item) => item.id === id);
      Object.assign(report, {
        ...analysis,
        status: 'done',
        updatedAt: new Date('2026-06-28T10:11:00.000Z'),
      });
      return report;
    },
    async saveFailed(id: string, message: string) {
      const report = reports.find((item) => item.id === id);
      Object.assign(report, { status: 'failed', errorMessage: message });
      return report;
    },
  };
}

describe('ReportService', () => {
  it('does not generate a report for unfinished sessions', async () => {
    const service = new ReportService({
      interviewRepository: createInterviewRepository({ status: 'running' }) as any,
      reportRepository: createReportRepository() as any,
      engine: { analyze: vi.fn() },
    });

    await expect(
      service.ensureReport({
        anonymousSessionId: 'anon_1',
        sessionId: 'session_1',
      })
    ).rejects.toThrow('завершите интервью');
  });

  it('generates and saves report analysis for a completed session', async () => {
    const reportRepository = createReportRepository();
    const engine = {
      analyze: vi.fn().mockResolvedValue({
        overallScore: 82,
        verdict: 'Хорошая база, нужно добавить цифры.',
        summary: 'Ответы релевантные, но местами общие.',
        criteria: {
          structure: 80,
          specificity: 70,
          relevance: 90,
          confidence: 78,
          riskPhrases: 84,
          brevity: 88,
        },
        recommendations: {
          topFixes: [
            'Добавлять измеримые результаты',
            'Структурировать ответы по STAR',
            'Убирать общие формулировки',
          ],
        },
        questionAnalysis: [
          {
            turnId: 'turn_1',
            question: 'Как вы ищете новых B2B-клиентов?',
            answer: 'Через холодные письма и партнёрские рекомендации.',
            whatWorked: 'Есть конкретные каналы.',
            whatWeak: 'Нет масштаба и результата.',
            strongerAnswerStar: 'S/T/A/R: ...',
            nextPractice: 'Подготовить пример с конверсией.',
          },
        ],
        model: 'gpt-4o-mini',
      }),
    };
    const service = new ReportService({
      interviewRepository: createInterviewRepository({ questionCount: 1 }) as any,
      reportRepository: reportRepository as any,
      engine,
    });

    const report = await service.ensureReport({
      anonymousSessionId: 'anon_1',
      sessionId: 'session_1',
    });

    expect(report).toMatchObject({
      sessionId: 'session_1',
      status: 'done',
      overallScore: 82,
      verdict: 'Хорошая база, нужно добавить цифры.',
    });
    expect(engine.analyze).toHaveBeenCalledOnce();
    expect(reportRepository.reports).toHaveLength(1);
  });

  it('returns a zero-score completed report when every main question was skipped', async () => {
    const reportRepository = createReportRepository();
    const engine = {
      analyze: vi.fn().mockResolvedValue({
        overallScore: 65,
        verdict: 'LLM не должен оценивать пустое интервью.',
        summary: 'Пустые ответы нельзя считать реальными.',
        criteria: {
          structure: 70,
          specificity: 70,
          relevance: 70,
          confidence: 70,
          riskPhrases: 100,
          brevity: 70,
        },
        recommendations: { topFixes: ['Не используется'] },
        questionAnalysis: [],
        model: 'gpt-4o-mini',
      }),
    };
    const service = new ReportService({
      interviewRepository: createInterviewRepository(
        { questionCount: 3 },
        [
          { answerTranscript: '—', question: 'Расскажите о себе?' },
          { answerTranscript: '—', question: 'Почему вам интересна роль?' },
          { answerTranscript: '—', question: 'Какой у вас релевантный опыт?' },
        ]
      ) as any,
      reportRepository: reportRepository as any,
      engine,
    });

    const report = await service.ensureReport({
      anonymousSessionId: 'anon_1',
      sessionId: 'session_1',
    });

    expect(report).toMatchObject({
      status: 'done',
      overallScore: 0,
      criteria: {
        structure: 0,
        specificity: 0,
        relevance: 0,
        confidence: 0,
        riskPhrases: 0,
        brevity: 0,
      },
    });
    expect(report.verdict).toContain('не состоялось');
    expect(report.questionAnalysis).toHaveLength(3);
    expect(engine.analyze).not.toHaveBeenCalled();
  });

  it('scales the final score and criteria by the share of answered main questions', async () => {
    const reportRepository = createReportRepository();
    const engine = {
      analyze: vi.fn().mockResolvedValue({
        overallScore: 90,
        verdict: 'Один сильный ответ.',
        summary: 'Ответ хороший, но интервью почти не пройдено.',
        criteria: {
          structure: 80,
          specificity: 70,
          relevance: 100,
          confidence: 90,
          riskPhrases: 100,
          brevity: 80,
        },
        recommendations: { topFixes: ['Добавить ответы на остальные вопросы'] },
        questionAnalysis: [
          {
            turnId: 'turn_1',
            question: 'Вопрос 1?',
            answer:
              'Я выстроил воронку B2B-продаж, сократил цикл сделки на 20% и поднял конверсию демо в оплату.',
            whatWorked: 'Есть результат.',
            whatWeak: 'Можно больше контекста.',
            strongerAnswerStar: 'S/T/A/R: ...',
            nextPractice: 'Добавить детали.',
          },
        ],
        model: 'gpt-4o-mini',
      }),
    };
    const service = new ReportService({
      interviewRepository: createInterviewRepository(
        { questionCount: 10 },
        Array.from({ length: 10 }, (_, index) => ({
          answerTranscript:
            index === 0
              ? 'Я выстроил воронку B2B-продаж, сократил цикл сделки на 20% и поднял конверсию демо в оплату.'
              : '—',
        }))
      ) as any,
      reportRepository: reportRepository as any,
      engine,
    });

    const report = await service.ensureReport({
      anonymousSessionId: 'anon_1',
      sessionId: 'session_1',
    });

    expect(report.overallScore).toBe(9);
    expect(report.criteria).toMatchObject({
      structure: 8,
      specificity: 7,
      relevance: 10,
      confidence: 9,
      riskPhrases: 10,
      brevity: 8,
    });
    expect(report.verdict).toContain('1 из 10');
    expect(engine.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        turns: expect.arrayContaining([
          expect.objectContaining({
            id: 'turn_1',
            answerTranscript:
              'Я выстроил воронку B2B-продаж, сократил цикл сделки на 20% и поднял конверсию демо в оплату.',
          }),
        ]),
      })
    );
    const firstAnalyzeCall = engine.analyze.mock.calls[0];
    expect(firstAnalyzeCall).toBeDefined();
    const analyzedTurns = firstAnalyzeCall![0].turns;
    expect(
      analyzedTurns.filter((turn: any) => turn.answerTranscript)
    ).toHaveLength(1);
  });

  it('uses realtime dialogue messages as report answers when answer transcript is not finalized', async () => {
    const reportRepository = createReportRepository();
    const engine = {
      analyze: vi.fn().mockResolvedValue({
        overallScore: 76,
        verdict: 'Ответ сохранён из realtime диалога.',
        summary: 'Есть пример, нужно больше метрик.',
        criteria: {
          structure: 70,
          specificity: 72,
          relevance: 82,
          confidence: 76,
          riskPhrases: 80,
          brevity: 78,
        },
        recommendations: { topFixes: ['Добавить цифры'] },
        questionAnalysis: [],
        model: 'gpt-4o-mini',
      }),
    };
    const service = new ReportService({
      interviewRepository: createInterviewRepository(
        { questionCount: 1 },
        {
          answerTranscript: null,
          metadata: {
            dialogue: [
              {
                role: 'user',
                content: 'В realtime я рассказал про холодные письма.',
                at: '2026-06-28T10:05:00.000Z',
              },
              {
                role: 'interviewer',
                content: 'Хорошо, добавьте результат.',
                at: '2026-06-28T10:06:00.000Z',
              },
            ],
          },
        }
      ) as any,
      reportRepository: reportRepository as any,
      engine,
    });

    await service.ensureReport({
      anonymousSessionId: 'anon_1',
      sessionId: 'session_1',
    });

    expect(engine.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        turns: [
          expect.objectContaining({
            answerTranscript: 'В realtime я рассказал про холодные письма.',
          }),
        ],
      })
    );
  });
});
