import { describe, expect, it } from 'vitest';
import {
  buildCandidateBehaviorContract,
  buildCandidateBehaviorSummary,
} from './candidateBehavior';

describe('AI candidate behavior contract', () => {
  it.each([
    ['strong_brief', '1–2 предложениях'],
    ['verbose_vague', 'командного «мы»'],
    ['anxious', 'лёгкую неуверенность'],
    ['overconfident', 'более широкий вклад'],
    ['weak_hard_good_soft', 'технической конкретики'],
  ] as const)('turns persona %s into observable behavior', (persona, marker) => {
    const contract = buildCandidateBehaviorContract({ persona });

    expect(contract).toContain('Профиль AI-кандидата:');
    expect(contract).toContain(marker);
  });

  it.each([
    ['calm', 'Сотрудничай с интервьюером'],
    ['realistic', 'часть конкретики сообщай сразу'],
    ['challenging', 'не раскрывай противоречия добровольно'],
  ] as const)(
    'turns difficulty %s into observable behavior',
    (difficulty, marker) => {
      const contract = buildCandidateBehaviorContract({ difficulty });

      expect(contract).toContain('Сложность AI-кандидата:');
      expect(contract).toContain(marker);
    }
  );

  it('keeps user notes in the same mandatory prompt contract', () => {
    expect(
      buildCandidateBehaviorContract({
        notes: 'На вопрос о зарплате сначала отвечает уклончиво.',
      })
    ).toContain('На вопрос о зарплате сначала отвечает уклончиво.');
  });

  it('keeps only factual candidate profile context for the interviewer coach', () => {
    const summary = buildCandidateBehaviorSummary({
      persona: 'overconfident',
      difficulty: 'challenging',
      notes: 'Не спешит признавать слабые места.',
    });

    expect(summary).toContain('переоценивает себя');
    expect(summary).toContain('сложный разговор');
    expect(summary).toContain('Не спешит признавать слабые места.');
    expect(summary).not.toContain('ОБЯЗАТЕЛЬНЫЕ ПРОЯВЛЕНИЯ');
    expect(summary).not.toContain('Отвечай');
    expect(summary).not.toContain('приписывай себе');
  });
});
