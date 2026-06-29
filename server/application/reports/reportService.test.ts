import { describe, expect, it, vi } from 'vitest';
import { ReportService } from './reportService';

function createInterviewRepository(sessionOverrides: Record<string, unknown>) {
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
  const turns = [
    {
      id: 'turn_1',
      sessionId: 'session_1',
      index: 1,
      kind: 'main',
      question: 'Как вы ищете новых B2B-клиентов?',
      answerTranscript: 'Через холодные письма и партнёрские рекомендации.',
      followUpForTurnId: null,
      answeredAt: new Date('2026-06-28T10:05:00.000Z'),
      createdAt: new Date('2026-06-28T10:01:00.000Z'),
    },
  ];

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
      interviewRepository: createInterviewRepository({}) as any,
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
});
