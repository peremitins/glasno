import { describe, expect, it } from 'vitest';
import {
  buildHintPack,
  buildInterviewPlanMetadata,
  getSessionGoalConfig,
  resolveNextPlannedQuestion,
} from './interviewPlan';

describe('interviewPlan', () => {
  it('builds a timed standard mixed plan with normalized custom questions', () => {
    const metadata = buildInterviewPlanMetadata({
      input: {
        source: { type: 'profession', role: 'Product manager' },
        level: 'middle',
        sessionGoal: 'standard',
        questionSourceMode: 'mixed',
        responseMode: 'text',
        hintMode: 'off',
        customQuestionsText:
          'Спроси про конфликт со стейкхолдером\nКак я приоритизирую roadmap?\nКак я приоритизирую roadmap?',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
      role: 'Product manager',
    });

    expect(metadata.sessionGoal).toBe('standard');
    expect(metadata.expectedDurationMinutes).toBe(15);
    expect(metadata.realtimeLimits).toMatchObject({
      targetMinutes: 15,
      warningAtMinutes: 13,
      softLimitMinutes: 15,
      hardLimitMinutes: 20,
    });
    expect(metadata.questionSourceMode).toBe('mixed');
    expect(metadata.plan.items.slice(0, 2)).toEqual([
      expect.objectContaining({
        id: 'plan_user_1',
        source: 'user',
        question: 'Спроси про конфликт со стейкхолдером?',
        priority: 'required',
        status: 'planned',
      }),
      expect.objectContaining({
        id: 'plan_user_2',
        source: 'user',
        question: 'Как я приоритизирую roadmap?',
        priority: 'required',
        status: 'planned',
      }),
    ]);
    expect(metadata.plan.items).toHaveLength(getSessionGoalConfig('standard').targetQuestionCount);
  });

  it('selects user questions first and stops custom-only sessions when they are exhausted', () => {
    const metadata = buildInterviewPlanMetadata({
      input: {
        source: { type: 'profession', role: 'Sales manager' },
        level: 'middle',
        sessionGoal: 'quick',
        questionSourceMode: 'custom',
        responseMode: 'text',
        hintMode: 'off',
        customQuestionsText: 'Почему вы хотите в продажи?',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      },
      role: 'Sales manager',
    });

    const first = resolveNextPlannedQuestion({
      metadata,
      turns: [],
    });
    expect(first).toMatchObject({
      source: 'user',
      planItemId: 'plan_user_1',
      question: 'Почему вы хотите в продажи?',
    });

    const next = resolveNextPlannedQuestion({
      metadata,
      turns: [
        {
          kind: 'main',
          metadata: {
            planItemId: 'plan_user_1',
            questionSource: 'user',
          },
        },
      ],
    });
    expect(next).toBeNull();
  });

  it('creates deterministic hint packs from a question and role context', () => {
    const hintPack = buildHintPack({
      question: 'Расскажите о сложных переговорах с клиентом.',
      role: 'Менеджер по продажам',
      vacancyTitle: 'B2B sales manager',
    });

    expect(hintPack.structure).toContain('результат');
    expect(hintPack.bullets.length).toBeGreaterThanOrEqual(3);
    expect(hintPack.terms).toContain('B2B sales manager');
    expect(hintPack.strongDirection).toContain('сложных переговорах');
  });
});
