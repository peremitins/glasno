import { describe, expect, it } from 'vitest';
import {
  CreateInterviewSessionRequestDto,
  GenerateInterviewHintsRequestDto,
  InterviewSessionDto,
  QuestionHintPackDto,
} from './interview';

describe('interview DTO hints', () => {
  it('accepts existing hint packs without detailed question hints', () => {
    const parsed = QuestionHintPackDto.parse({
        structure: 'Отвечайте по STAR.',
        bullets: ['Назовите ситуацию.', 'Опишите результат.'],
        terms: ['результат'],
        avoid: ['Не отвечайте слишком общо.'],
        strongDirection: 'Раскройте вопрос через пример.',
    });

    expect(parsed.structure).toBe('Отвечайте по STAR.');
    expect('detailed' in parsed).toBe(false);
  });

  it('accepts detailed question-specific hints', () => {
    const parsed = QuestionHintPackDto.parse({
      structure: 'Отвечайте по STAR.',
      bullets: ['Назовите ситуацию.'],
      terms: ['TypeScript'],
      avoid: ['Не уходите в общие слова.'],
      strongDirection: 'Покажите влияние TypeScript на качество кода.',
      detailed: {
        focus: 'Проверяет понимание влияния типизации на сопровождение кода.',
        answerPlan: [
          'Коротко определить TypeScript как типизированное расширение JavaScript.',
          'Связать статическую проверку типов с ранним обнаружением ошибок.',
          'Показать влияние на рефакторинг и командную разработку.',
        ],
        keyDefinitions: [
          'TypeScript — язык поверх JavaScript со статической типизацией.',
          'Статическая типизация помогает находить часть ошибок до запуска кода.',
        ],
        sampleAnswerQuestion:
          'Как вы оцениваете влияние TypeScript на улучшение качества кода?',
        sampleAnswer:
          'Я бы начал с того, что TypeScript снижает риск ошибок ещё до runtime.',
      },
    });

    expect(parsed.detailed?.answerPlan).toHaveLength(3);
    expect(parsed.detailed?.keyDefinitions[0]).toContain('TypeScript');
    expect(parsed.detailed?.sampleAnswerQuestion).toContain('TypeScript');
  });

  it('validates hint generation requests by turn id', () => {
    expect(
      GenerateInterviewHintsRequestDto.parse({ turnId: 'turn_1' })
    ).toEqual({
      turnId: 'turn_1',
    });
    expect(() => GenerateInterviewHintsRequestDto.parse({ turnId: '' })).toThrow();
  });

  it('defaults new interview sessions to the standard 15-minute plan', () => {
    const parsed = CreateInterviewSessionRequestDto.parse({
      source: {
        type: 'profession',
        role: 'Менеджер по продукту',
      },
    });

    expect(parsed.sessionGoal).toBe('standard');
    expect(parsed.level).toBe('middle');
    expect(parsed.trainingMode).toBe('candidate');
  });

  it('accepts interviewer training settings with a real candidate resume', () => {
    const parsed = CreateInterviewSessionRequestDto.parse({
      trainingMode: 'interviewer',
      source: {
        type: 'text',
        title: 'Frontend-разработчик',
        text: 'Vue, TypeScript, продуктовая команда, много самостоятельной работы.',
      },
      resumeText:
        'Алексей, frontend-разработчик. 4 года опыта, Vue, TypeScript, дизайн-системы.',
      candidatePersona: 'strong_brief',
      candidateDifficulty: 'realistic',
      candidateNotes: 'Кандидат отвечает коротко, но по делу.',
    });

    expect(parsed.trainingMode).toBe('interviewer');
    expect(parsed.candidatePersona).toBe('strong_brief');
    expect(parsed.candidateDifficulty).toBe('realistic');
    expect(parsed.resumeText).toContain('Алексей');
  });

  it('exposes interviewer training profile on session responses', () => {
    const parsed = InterviewSessionDto.parse({
      id: 'session_1',
      status: 'running',
      trainingMode: 'interviewer',
      source: 'text',
      vacancyTitle: 'Frontend-разработчик',
      vacancyUrl: null,
      companyName: null,
      role: 'Frontend-разработчик',
      level: 'middle',
      questionCount: 3,
      sessionGoal: 'quick',
      expectedDurationMinutes: 7,
      questionSourceMode: 'glasno',
      focus: null,
      responseMode: 'text',
      hintMode: 'off',
      realtimeLimits: {
        targetMinutes: 7,
        warningAtMinutes: 6,
        softLimitMinutes: 7,
        hardLimitMinutes: 10,
      },
      questionPacing: {
        firstReminderAfterMinutes: 5,
        reminderCooldownMinutes: 5,
      },
      plan: {
        goal: 'quick',
        expectedDurationMinutes: 7,
        items: [],
      },
      language: 'ru',
      interviewerMode: 'neutral',
      interviewerAvatarId: 'neutral-pro',
      interviewerFaceId: 'male-neutral',
      candidatePersona: 'anxious',
      candidateDifficulty: 'challenging',
      candidateNotes: 'Кандидат заметно волнуется.',
      currentQuestionIndex: 1,
      totalQuestions: 3,
      createdAt: '2026-07-08T00:00:00.000Z',
    });

    expect(parsed.trainingMode).toBe('interviewer');
    expect(parsed.candidatePersona).toBe('anxious');
    expect(parsed.candidateDifficulty).toBe('challenging');
    expect(parsed.questionPacing.firstReminderAfterMinutes).toBe(5);
  });
});
