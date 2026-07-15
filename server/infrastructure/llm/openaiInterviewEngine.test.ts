import { describe, expect, it, vi } from 'vitest';
import {
  CONVERSE_MOVE_ON_RULE,
  OpenAiInterviewEngine,
  buildConverseInstruction,
  buildConverseUserText,
  extractResponsesText,
  normalizeSampleAnswerHint,
  normalizeQuestionHintDetails,
  parseJsonObject,
  resolveConverseMaxOutputTokens,
  selectGeneratedQuestionCandidate,
} from './openaiInterviewEngine';
import type { ConverseParams } from '@/server/interface/interviewEngine';
import { readFileSync } from 'node:fs';

describe('openai interview engine helpers', () => {
  it('reserves more output tokens for the verbose AI candidate', () => {
    expect(
      resolveConverseMaxOutputTokens({
        trainingMode: 'interviewer',
        metadata: { candidatePersona: 'verbose_vague' },
      })
    ).toBe(650);
    expect(
      resolveConverseMaxOutputTokens({
        trainingMode: 'interviewer',
        metadata: { candidatePersona: 'strong_brief' },
      })
    ).toBe(380);
    expect(
      resolveConverseMaxOutputTokens({
        trainingMode: 'candidate',
        metadata: { candidatePersona: 'verbose_vague' },
      })
    ).toBe(380);
  });

  it('extracts text from every Responses API output content block', () => {
    const text = extractResponsesText({
      output: [
        {
          content: [{ type: 'reasoning', text: 'ignore this' }],
        },
        {
          content: [{ type: 'output_text', text: '{"question":"' }],
        },
        {
          content: [{ type: 'output_text', text: 'Расскажите о KPI"}' }],
        },
      ],
    });

    expect(text).toBe('{"question":"Расскажите о KPI"}');
  });

  it('parses strict json even when the model wraps it in a json fence', () => {
    expect(parseJsonObject('```json\n{"needsClarification":false}\n```')).toEqual({
      needsClarification: false,
    });
  });

  it('normalizes detailed question hints from model json', () => {
    expect(
      normalizeQuestionHintDetails({
        focus: '  Проверяет знание TypeScript.  ',
        answerPlan: [
          'Определить TypeScript.',
          'Связать типы с ранним поиском ошибок.',
          'Показать пользу для рефакторинга.',
          'Назвать влияние на командную разработку.',
          'Лишний пункт будет отброшен.',
        ],
        keyDefinitions: [
          'TypeScript — типизированное расширение JavaScript.',
          '',
          'Runtime — выполнение кода в браузере или Node.js.',
          'Очень длинное определение '.repeat(30),
        ],
        sampleAnswer: '  Я бы начал с влияния типизации на качество кода.  ',
      })
    ).toEqual({
      focus: 'Проверяет знание TypeScript.',
      answerPlan: [
        'Определить TypeScript.',
        'Связать типы с ранним поиском ошибок.',
        'Показать пользу для рефакторинга.',
        'Назвать влияние на командную разработку.',
      ],
      keyDefinitions: [
        'TypeScript — типизированное расширение JavaScript.',
        'Runtime — выполнение кода в браузере или Node.js.',
        expect.stringMatching(/^Очень длинное определение/),
      ],
      example: {
        kind: 'candidate_answer',
        context: 'Текущий вопрос интервью.',
        text: 'Я бы начал с влияния типизации на качество кода.',
      },
    });
  });

  it('keeps an interviewer hint example as questions and rejects candidate prose', () => {
    const options = {
      trainingMode: 'interviewer' as const,
      context: 'Плановый вопрос про React и TypeScript',
      fallbackQuestion: 'Как вы выбирали стек для последнего проекта?',
    };

    expect(
      normalizeQuestionHintDetails(
        {
          focus: 'Проверяет опыт выбора стека.',
          answerPlan: ['Спросить о задаче.'],
          keyDefinitions: [],
          example: {
            mainQuestion:
              'Какую задачу на прошлом проекте вы решали в рамках выбранного стека?',
            followUps: [
              'Почему выбрали именно этот подход?',
              'Как измерили результат?',
            ],
          },
        },
        options
      )
    ).toMatchObject({
      example: {
        kind: 'interviewer_question',
        text: 'Какую задачу на прошлом проекте вы решали в рамках выбранного стека?',
        followUps: [
          'Почему выбрали именно этот подход?',
          'Как измерили результат?',
        ],
      },
    });

    expect(
      normalizeQuestionHintDetails(
        {
          focus: 'Проверяет опыт выбора стека.',
          answerPlan: ['Спросить о задаче.'],
          keyDefinitions: [],
          example: {
            mainQuestion:
              'Чаще всего я беру React и TypeScript, потому что типы помогают быстрее ловить ошибки?',
            followUps: [],
          },
        },
        options
      )
    ).toBeNull();
  });

  it('uses a hint-specific session context without candidate role imperatives', () => {
    const source = readFileSync(
      'server/infrastructure/llm/openaiInterviewEngine.ts',
      'utf8'
    );
    const hintMethod = source.slice(
      source.indexOf('async generateQuestionHints('),
      source.indexOf('async generateHintExample(')
    );

    expect(hintMethod).toContain('sessionContextForHints(params.session)');
    expect(hintMethod).not.toContain('sessionContextForConverse(params.session)');
  });

  it('falls back to the planned question after two invalid interviewer examples', async () => {
    const engine = new OpenAiInterviewEngine({ apiKey: 'test' });
    const requestJson = vi
      .spyOn(engine as any, 'requestJson')
      .mockResolvedValue({
        focus: 'Проверяет опыт выбора стека.',
        answerPlan: ['Спросить о личном вкладе.'],
        keyDefinitions: [],
        example: {
          mainQuestion:
            'Чаще всего я беру React и TypeScript, потому что типы помогают быстрее ловить ошибки?',
          followUps: [],
        },
      });
    const session: ConverseParams['session'] = {
      id: 'session_invalid_interviewer_hint',
      anonymousSessionId: 'anon_invalid_interviewer_hint',
      userId: null,
      trainingMode: 'interviewer',
      source: 'profession',
      role: 'Frontend-разработчик',
      level: 'middle',
      questionCount: 3,
      language: 'ru',
      interviewerMode: 'neutral',
      interviewerAvatarId: 'neutral-pro',
      status: 'running',
      companyName: null,
      vacancyTitle: null,
      vacancyRaw: null,
      vacancyUrl: null,
      resumeRaw: null,
      metadata: {},
      createdAt: new Date('2026-07-14T10:00:00.000Z'),
    };
    const turn = {
      id: 'turn_invalid_interviewer_hint',
      sessionId: session.id,
      index: 1,
      kind: 'main' as const,
      question: 'Как вы выбирали стек для последнего проекта?',
      answerTranscript: null,
      followUpForTurnId: null,
      metadata: null,
      answeredAt: null,
      createdAt: new Date('2026-07-14T10:00:00.000Z'),
    };

    const hints = await engine.generateQuestionHints({
      session,
      turn,
      turns: [],
      dialogue: [],
    });

    expect(requestJson).toHaveBeenCalledTimes(2);
    expect(hints.example).toEqual({
      kind: 'interviewer_question',
      context: turn.question,
      text: turn.question,
      followUps: [],
    });
  });

  it('normalizes sample answer hint json for follow-up questions', () => {
    expect(
      normalizeSampleAnswerHint({
        sampleAnswer: '  Я бы связал TypeScript со скоростью онбординга.  ',
      })
    ).toEqual({
      sampleAnswer: 'Я бы связал TypeScript со скоростью онбординга.',
    });
  });

  it('does not append ellipsis when a generated sample answer is too long', () => {
    const normalized = normalizeSampleAnswerHint({
      sampleAnswer:
        'Я бы начал с конкретного случая: на проекте заметил деградацию производительности после внедрения нового списка. ' +
        'Сначала проверил Web Vitals и профилировщик, затем нашёл лишние перерендеры и вынес тяжёлые вычисления. ' +
        'После релиза сравнил метрики до и после, подтвердил улучшение и описал результат команде. ' +
        'Дополнительная техническая деталь '.repeat(40),
    });

    expect(normalized.sampleAnswer.length).toBeLessThanOrEqual(700);
    expect(normalized.sampleAnswer).not.toMatch(/…$/);
    expect(normalized.sampleAnswer).toMatch(/[.!?]$/);
  });

  it('switches live dialogue instructions to AI candidate mode for interviewer training', () => {
    const instruction = buildConverseInstruction({
      trainingMode: 'interviewer',
      interviewerMode: 'neutral',
      metadata: {},
    });

    expect(instruction).toContain('Ты — AI-кандидат Гласно');
    expect(instruction).toContain('Пользователь проводит интервью');
    expect(instruction).toContain('Отвечай как кандидат');
    expect(instruction).toContain('Длину ответа определяет выбранный профиль');
    expect(instruction).not.toContain('1–3 предложения');
    expect(instruction).not.toContain('отвечать ВМЕСТО кандидата');
  });

  it('turns overconfidence and challenging difficulty into mandatory observable behavior', () => {
    const session: ConverseParams['session'] = {
      id: 'session_behavior_contract',
      anonymousSessionId: 'anon_behavior_contract',
      userId: null,
      trainingMode: 'interviewer',
      source: 'profession',
      role: 'Frontend-разработчик',
      level: 'middle',
      questionCount: 3,
      language: 'ru',
      interviewerMode: 'neutral',
      interviewerAvatarId: 'neutral-pro',
      status: 'running',
      companyName: null,
      vacancyTitle: null,
      vacancyRaw: null,
      vacancyUrl: null,
      resumeRaw: null,
      metadata: {
        candidatePersona: 'overconfident',
        candidateDifficulty: 'challenging',
      },
      createdAt: new Date('2026-07-14T10:00:00.000Z'),
    };

    const text = buildConverseUserText({
      session,
      turn: {
        id: 'turn_behavior_contract',
        sessionId: session.id,
        index: 1,
        kind: 'main',
        question: 'Опыт и зона ответственности',
        answerTranscript: null,
        followUpForTurnId: null,
        metadata: null,
        answeredAt: null,
        createdAt: new Date('2026-07-14T10:00:00.000Z'),
      },
      turns: [],
      dialogue: [],
      exchanges: 0,
    });

    expect(text).toContain('ОБЯЗАТЕЛЬНЫЕ ПРОЯВЛЕНИЯ');
    expect(text).toContain('приписывай себе более широкий вклад');
    expect(text).toContain('не раскрывай противоречия добровольно');
  });

  it('generates an interviewer question suggestion instead of an AI-candidate opening line', () => {
    const source = readFileSync(
      'server/infrastructure/llm/openaiInterviewEngine.ts',
      'utf8'
    );

    expect(source).toContain('пример основного вопроса для пользователя-интервьюера');
    expect(source).not.toContain('стартовую или переходную реплику AI-кандидата');
  });

  it('keeps the AI candidate from answering as an interviewer', () => {
    const session: ConverseParams['session'] = {
      id: 'session_interviewer_training',
      anonymousSessionId: 'anon_interviewer_training',
      userId: null,
      trainingMode: 'interviewer',
      source: 'profession',
      role: 'Frontend-разработчик',
      level: 'middle',
      questionCount: 3,
      language: 'ru',
      interviewerMode: 'neutral',
      interviewerAvatarId: 'neutral-pro',
      status: 'running',
      companyName: null,
      vacancyTitle: null,
      vacancyRaw: null,
      vacancyUrl: null,
      resumeRaw: null,
      metadata: {},
      createdAt: new Date('2026-07-13T10:00:00.000Z'),
    };

    expect(buildConverseInstruction(session)).toContain(
      'Никогда не отвечай как интервьюер'
    );

    const text = buildConverseUserText({
      session,
      turn: {
        id: 'turn_interviewer_training',
        sessionId: session.id,
        index: 1,
        kind: 'main',
        question: 'Расскажите о производительности в React.',
        answerTranscript: null,
        followUpForTurnId: null,
        metadata: null,
        answeredAt: null,
        createdAt: new Date('2026-07-13T10:00:00.000Z'),
      },
      turns: [],
      dialogue: [
        {
          role: 'user',
          content: 'Хорошо, давай продолжим. На чем мы остановились?',
        },
      ],
      exchanges: 1,
    });

    expect(text).toContain('Реплик интервьюера по этому этапу: 1');
    expect(text).not.toContain('Реплик кандидата по этому вопросу');
    expect(text).toContain('Предыдущие основные этапы');
    expect(text).toContain('Диалог по текущему этапу');
    expect(text).not.toContain('Диалог по текущему вопросу');
  });

  it('keeps the interviewer in question mode instead of retelling or teaching', () => {
    const instruction = buildConverseInstruction({
      trainingMode: 'candidate',
      interviewerMode: 'neutral',
      metadata: {},
    });

    expect(instruction).toContain('Не пересказывай и не оценивай ответ кандидата');
    expect(instruction).toContain('Не задавай уточняющие вопросы по инерции');
    expect(instruction).toContain('не задавай следующий вопрос, а коротко предложи перейти');
    expect(instruction).toContain('Не повторяй уже выясненные аспекты другими словами');
    expect(instruction).toContain('даже если кандидат прямо просит объяснить');
    expect(instruction).toContain('«Давай»');
    expect(instruction).toContain('«На чём мы остановились?»');
    expect(instruction).toContain('не продолжай ошибочную обучающую реплику');
    expect(instruction).not.toContain('только по прямой просьбе кандидата');
  });

  it('uses the session training mode as the only role source', () => {
    const instruction = buildConverseInstruction({
      trainingMode: 'candidate',
      interviewerMode: 'strict',
      metadata: { trainingMode: 'interviewer' },
    });

    expect(instruction).toContain('Ты — интервьюер Гласно');
    expect(instruction).not.toContain('Ты — AI-кандидат Гласно');
  });

  it.each([
    ['soft', 'Тон интервьюера: мягкий', 'поддерживающе'],
    ['neutral', 'Тон интервьюера: нейтральный', 'деловым'],
    ['strict', 'Тон интервьюера: строгий', 'требовательно'],
  ] as const)(
    'turns interviewer mode %s into an explicit behavior contract',
    (interviewerMode, label, behavior) => {
      const instruction = buildConverseInstruction({
        trainingMode: 'candidate',
        interviewerMode,
        metadata: {},
      });

      expect(instruction).toContain(label);
      expect(instruction).toContain(behavior);
    }
  );

  it('keeps AI-candidate settings out of the AI-interviewer context', () => {
    const session: ConverseParams['session'] = {
      id: 'session_candidate_training',
      anonymousSessionId: 'anon_candidate_training',
      userId: null,
      trainingMode: 'candidate',
      source: 'profession',
      role: 'Frontend-разработчик',
      level: 'middle',
      questionCount: 3,
      language: 'ru',
      interviewerMode: 'strict',
      interviewerAvatarId: 'strict-lead',
      status: 'running',
      companyName: null,
      vacancyTitle: null,
      vacancyRaw: null,
      vacancyUrl: null,
      resumeRaw: null,
      metadata: {
        trainingMode: 'interviewer',
        interviewerFaceId: 'female-strict',
        candidatePersona: 'strong_brief',
        candidateDifficulty: 'realistic',
      },
      createdAt: new Date('2026-07-13T10:00:00.000Z'),
    };

    const text = buildConverseUserText({
      session,
      turn: {
        id: 'turn_candidate_training',
        sessionId: session.id,
        index: 1,
        kind: 'main',
        question: 'Как вы оптимизируете загрузку React-приложения?',
        answerTranscript: null,
        followUpForTurnId: null,
        metadata: null,
        answeredAt: null,
        createdAt: new Date('2026-07-13T10:00:00.000Z'),
      },
      turns: [],
      dialogue: [
        {
          role: 'interviewer',
          content: 'Если хотите, можем обсудить это подробнее.',
        },
        { role: 'user', content: 'Давай.' },
      ],
      exchanges: 1,
    });

    expect(text).toContain('AI играет интервьюера');
    expect(text).toContain('Пол интервьюера: женский');
    expect(text).toContain('Тон интервьюера: строгий');
    expect(text).not.toContain('Профиль AI-кандидата');
    expect(text).not.toContain('Сложность AI-кандидата');
    expect(text).not.toContain('Заметки о кандидате');
  });

  it('keeps interviewer settings out of the AI-candidate context', () => {
    const session: ConverseParams['session'] = {
      id: 'session_interviewer_context',
      anonymousSessionId: 'anon_interviewer_context',
      userId: null,
      trainingMode: 'interviewer',
      source: 'profession',
      role: 'Frontend-разработчик',
      level: 'middle',
      questionCount: 3,
      language: 'ru',
      interviewerMode: 'strict',
      interviewerAvatarId: 'strict-lead',
      status: 'running',
      companyName: null,
      vacancyTitle: null,
      vacancyRaw: null,
      vacancyUrl: null,
      resumeRaw: null,
      metadata: {
        interviewerFaceId: 'female-strict',
        candidatePersona: 'anxious',
        candidateDifficulty: 'challenging',
      },
      createdAt: new Date('2026-07-13T10:00:00.000Z'),
    };

    const text = buildConverseUserText({
      session,
      turn: {
        id: 'turn_interviewer_context',
        sessionId: session.id,
        index: 1,
        kind: 'main',
        question: 'Начните интервью.',
        answerTranscript: null,
        followUpForTurnId: null,
        metadata: null,
        answeredAt: null,
        createdAt: new Date('2026-07-13T10:00:00.000Z'),
      },
      turns: [],
      dialogue: [],
      exchanges: 0,
    });

    expect(text).toContain('Профиль AI-кандидата');
    expect(text).toContain('Сложность AI-кандидата');
    expect(text).not.toContain('Режим интервьюера:');
    expect(text).not.toContain('Пол интервьюера:');
    expect(text).not.toContain('Тон интервьюера:');
  });

  it('requires a move-on proposal when the question timebox expires', () => {
    const instruction = buildConverseInstruction(
      {
        trainingMode: 'candidate',
        interviewerMode: 'neutral',
        metadata: {},
      },
      true
    );

    expect(instruction).toContain('Время на текущий вопрос истекло');
    expect(instruction).toContain('не задавай новый вопрос и не добавляй уточнений');
    expect(instruction).toContain('например: «Отлично, этот вопрос мы достаточно обсудили. Готовы перейти к следующему?»');
    expect(instruction).toContain('Не переключай вопрос самостоятельно');
  });

  it('does not use the number of dialogue replies as a move-on criterion', () => {
    expect(CONVERSE_MOVE_ON_RULE).not.toContain('много реплик');
  });

  it('adds previous main questions without answers to live dialogue context', () => {
    const session: ConverseParams['session'] = {
      id: 'session_1',
      anonymousSessionId: 'anon_1',
      userId: null,
      trainingMode: 'candidate',
      source: 'profession',
      role: 'Product Manager',
      level: 'senior',
      questionCount: 3,
      language: 'ru',
      interviewerMode: 'neutral',
      interviewerAvatarId: 'neutral-pro',
      status: 'running',
      companyName: 'Acme',
      vacancyTitle: 'Senior PM',
      vacancyRaw: null,
      vacancyUrl: null,
      resumeRaw: null,
      metadata: {},
      createdAt: new Date('2026-07-09T10:00:00.000Z'),
    };
    const currentTurn: ConverseParams['turn'] = {
      id: 'turn_3',
      sessionId: 'session_1',
      index: 3,
      kind: 'main',
      question: 'Как вы запускали сложный продукт?',
      answerTranscript: null,
      followUpForTurnId: null,
      metadata: null,
      answeredAt: null,
      createdAt: new Date('2026-07-09T10:03:00.000Z'),
    };
    const turns: ConverseParams['turns'] = [
      {
        id: 'turn_1',
        sessionId: 'session_1',
        index: 1,
        kind: 'main',
        question: 'Почему вы хотите эту роль?',
        answerTranscript: 'Ответ не должен уходить в этот блок.',
        followUpForTurnId: null,
        metadata: null,
        answeredAt: new Date('2026-07-09T10:01:00.000Z'),
        createdAt: new Date('2026-07-09T10:01:00.000Z'),
      },
      {
        id: 'turn_2',
        sessionId: 'session_1',
        index: 2,
        kind: 'clarification',
        question: 'Какой именно продукт?',
        answerTranscript: 'Уточнение тоже не нужно.',
        followUpForTurnId: 'turn_1',
        metadata: null,
        answeredAt: new Date('2026-07-09T10:02:00.000Z'),
        createdAt: new Date('2026-07-09T10:02:00.000Z'),
      },
      currentTurn,
    ];

    const text = buildConverseUserText({
      session,
      turn: currentTurn,
      turns,
      dialogue: [
        {
          role: 'user',
          content: 'Я отвечал за go-to-market.',
        },
      ],
      exchanges: 1,
    });

    expect(text).toContain('Предыдущие основные вопросы');
    expect(text).toContain('1. Почему вы хотите эту роль?');
    expect(text).not.toContain('Ответ не должен');
    expect(text).not.toContain('Какой именно продукт?');
    expect(text).toContain('Текущий вопрос: Как вы запускали сложный продукт?');
    expect(text).toContain('Кандидат: Я отвечал за go-to-market.');
  });

  it('selects a safe semantic candidate and rejects hidden concept matches', () => {
    const selected = selectGeneratedQuestionCandidate(
      [
        {
          question: 'Как браузер строит DOM и CSSOM?',
          semantic: {
            conceptKey: 'browser_rendering',
            conceptLabel: 'Построение DOM и CSSOM',
            topicTags: ['dom', 'cssom'],
            requiredContextTags: [],
            focus: 'professional',
          },
          matchesPreferenceIds: ['hidden_1'],
        },
        {
          question: 'Как вы уменьшаете размер JavaScript-бандла?',
          semantic: {
            conceptKey: 'javascript_bundle_optimization',
            conceptLabel: 'Оптимизация размера JavaScript-бандла',
            topicTags: ['javascript', 'bundling'],
            requiredContextTags: [],
            focus: 'professional',
          },
          matchesPreferenceIds: [],
        },
      ],
      [
        {
          id: 'hidden_1',
          status: 'hidden',
          question: 'Объясните построение DOM и CSSOM.',
          semantic: {
            conceptKey: 'browser_rendering',
            conceptLabel: 'Построение DOM и CSSOM',
            topicTags: ['dom', 'cssom'],
            requiredContextTags: [],
            focus: 'professional',
          },
        },
      ]
    );

    expect(selected?.question).toContain('бандла');
  });
});
