import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  normalizeLearningTermExplanation,
  normalizeLearningTermsForText,
} from './openaiLearningTermsEngine';

const source = readFileSync(
  'server/infrastructure/llm/openaiLearningTermsEngine.ts',
  'utf8'
);

describe('openai learning terms engine helpers', () => {
  it('keeps only terms that are present in the source text', () => {
    expect(
      normalizeLearningTermsForText(
        'Расскажите про область видимости и CORS.',
        {
          terms: [
            {
              phrase: 'область видимости',
              shortDefinition: 'Область видимости — часть кода, где доступна переменная.',
            },
            {
              phrase: 'React Server Components',
              shortDefinition: 'Этого термина нет в тексте.',
            },
            {
              phrase: 'cors',
              shortDefinition: 'CORS — правила доступа между доменами.',
            },
          ],
        }
      )
    ).toEqual([
      {
        phrase: 'область видимости',
        shortDefinition: 'Область видимости — часть кода, где доступна переменная.',
      },
      {
        phrase: 'CORS',
        shortDefinition: 'CORS — правила доступа между доменами.',
      },
    ]);
  });

  it('deduplicates terms and caps definitions for tooltip usage', () => {
    const terms = normalizeLearningTermsForText('CORS и CORS policy.', {
      terms: [
        {
          phrase: 'CORS',
          shortDefinition: 'Очень длинное определение '.repeat(20),
        },
        {
          phrase: 'cors',
          shortDefinition: 'Дубль должен быть отброшен.',
        },
      ],
    });

    expect(terms).toHaveLength(1);
    expect(terms[0]?.shortDefinition.length).toBeLessThanOrEqual(180);
    expect(terms[0]?.shortDefinition).not.toMatch(/…$/);
  });

  it('requests minimal reasoning effort so GPT-5 nano returns text within the token budget', () => {
    // Без этого reasoning-модель тратит весь max_output_tokens на размышления
    // и возвращает пустой ответ (status=incomplete) — на проде массовые 502.
    expect(source).toContain("reasoning: { effort: 'minimal' }");
    expect(source).toContain("model.startsWith('gpt-5')");
  });

  it('does not use local semantic allow or deny lists', () => {
    expect(source).not.toContain('HIGH_SIGNAL_RUSSIAN_PATTERNS');
    expect(source).not.toContain('LOW_SIGNAL_RUSSIAN_PATTERNS');
    expect(source).not.toContain('COMMON_TECH_NAME_TOKENS');
    expect(source).not.toContain('LATIN_CONNECTOR_TOKENS');
    expect(source).not.toContain('isHighSignalLearningTerm');
  });

  it('keeps model-selected generic phrases when they are present in the text', () => {
    expect(
      normalizeLearningTermsForText(
        'Опишите ситуацию, когда из-за сдвига сроков или скрытого риска вам пришлось быстро перестроить план проекта: как вы выявили проблему, какие коммуникации запустили и какой результат получили?',
        {
          terms: [
            {
              phrase: 'сдвига сроков',
              shortDefinition: 'Общее описание изменения сроков.',
            },
            {
              phrase: 'скрытого риска',
              shortDefinition: 'Обычный риск, который заметили не сразу.',
            },
            {
              phrase: 'план проекта',
              shortDefinition: 'Порядок работ по проекту.',
            },
            {
              phrase: 'коммуникации',
              shortDefinition: 'Обмен информацией между людьми.',
            },
            {
              phrase: 'результат',
              shortDefinition: 'Итог работы.',
            },
          ],
        }
      )
    ).toEqual([
      {
        phrase: 'сдвига сроков',
        shortDefinition: 'Общее описание изменения сроков.',
      },
      {
        phrase: 'скрытого риска',
        shortDefinition: 'Обычный риск, который заметили не сразу.',
      },
      {
        phrase: 'план проекта',
        shortDefinition: 'Порядок работ по проекту.',
      },
    ]);
  });

  it('keeps model-selected technical concepts without semantic filtering', () => {
    expect(
      normalizeLearningTermsForText(
        'Объясните CORS, область видимости и стрелочную функцию в JavaScript.',
        {
          terms: [
            {
              phrase: 'CORS',
              shortDefinition: 'CORS — правила доступа между доменами.',
            },
            {
              phrase: 'область видимости',
              shortDefinition: 'Часть кода, где доступна переменная.',
            },
            {
              phrase: 'стрелочную функцию',
              shortDefinition: 'Короткий синтаксис функции в JavaScript.',
            },
          ],
        }
      )
    ).toEqual([
      {
        phrase: 'CORS',
        shortDefinition: 'CORS — правила доступа между доменами.',
      },
      {
        phrase: 'область видимости',
        shortDefinition: 'Часть кода, где доступна переменная.',
      },
      {
        phrase: 'стрелочную функцию',
        shortDefinition: 'Короткий синтаксис функции в JavaScript.',
      },
    ]);
  });

  it('keeps broad frontend framework names if the model selects them', () => {
    expect(
      normalizeLearningTermsForText(
        'Назови три способа улучшить производительность фронтенда в Vue или React и объясни метрики LCP/INP/TTFB.',
        {
          terms: [
            {
              phrase: 'Vue или React',
              shortDefinition: 'Популярные фронтенд-фреймворки.',
            },
            {
              phrase: 'LCP/INP/TTFB',
              shortDefinition: 'Метрики производительности загрузки и отклика.',
            },
          ],
        }
      )
    ).toEqual([
      {
        phrase: 'Vue или React',
        shortDefinition: 'Популярные фронтенд-фреймворки.',
      },
      {
        phrase: 'LCP/INP/TTFB',
        shortDefinition: 'Метрики производительности загрузки и отклика.',
      },
    ]);
  });

  it('keeps standalone framework names and Web Vitals if the model selects them', () => {
    expect(
      normalizeLearningTermsForText(
        'Можно использовать Lighthouse или Web Vitals, а в Vue есть инструменты для отслеживания эффективности реактивности.',
        {
          terms: [
            {
              phrase: 'Web Vitals',
              shortDefinition: 'Набор метрик качества пользовательского опыта.',
            },
            {
              phrase: 'Vue',
              shortDefinition: 'Фреймворк для интерфейсов.',
            },
          ],
        }
      )
    ).toEqual([
      {
        phrase: 'Web Vitals',
        shortDefinition: 'Набор метрик качества пользовательского опыта.',
      },
      {
        phrase: 'Vue',
        shortDefinition: 'Фреймворк для интерфейсов.',
      },
    ]);
  });

  it('drops phrases longer than the DTO limit so the batch response stays valid', () => {
    const longPhrase = 'очень длинная фраза кандидата '.repeat(5).trim();
    expect(longPhrase.length).toBeGreaterThan(120);

    expect(
      normalizeLearningTermsForText(
        `Вопрос содержит ${longPhrase} целиком, а ещё CORS.`,
        {
          terms: [
            {
              phrase: longPhrase,
              shortDefinition: 'Слишком длинный кандидат — отбрасываем.',
            },
            {
              phrase: 'CORS',
              shortDefinition: 'CORS — правила доступа между доменами.',
            },
          ],
        }
      )
    ).toEqual([
      {
        phrase: 'CORS',
        shortDefinition: 'CORS — правила доступа между доменами.',
      },
    ]);
  });

  it('normalizes full explanations with safe fallbacks', () => {
    expect(
      normalizeLearningTermExplanation('CORS', 'Короткое определение', {
        title: '  CORS  ',
        shortDefinition: '',
        explanation: '  CORS ограничивает, какие сайты могут читать ответ API.  ',
      })
    ).toEqual({
      term: 'CORS',
      title: 'CORS',
      shortDefinition: 'Короткое определение',
      explanation: 'CORS ограничивает, какие сайты могут читать ответ API.',
    });
  });
});
