import { describe, expect, it } from 'vitest';
import {
  CreateInterviewSessionRequestDto,
  GenerateInterviewHintsRequestDto,
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
  });
});
