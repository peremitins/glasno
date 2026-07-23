import { describe, expect, it } from 'vitest';
import {
  buildRealtimeContextFromState,
  buildRealtimeInstructions,
  buildRealtimeSessionPayload,
} from './realtimeConfig';

describe('realtimeConfig', () => {
  const context = {
    sessionId: 'session_1',
    role: 'Product Manager',
    level: 'senior',
    interviewerMode: 'strict' as const,
    vacancyTitle: 'Senior Product Manager',
    companyName: 'Glasno',
    currentQuestion: 'Расскажите о запуске сложного продукта.',
  };

  it('builds Russian interview instructions scoped to the current question', () => {
    const instructions = buildRealtimeInstructions(context);

    expect(instructions).toContain('говори по-русски');
    expect(instructions).toContain('Senior Product Manager');
    expect(instructions).toContain('Расскажите о запуске сложного продукта.');
    expect(instructions).toContain('переход выполняет приложение');
    // Команда «следующий вопрос» — для приложения: модель не должна отвечать.
    expect(instructions).toContain('НЕ отвечай на неё');
    expect(instructions).toContain('другой вопрос');
    expect(instructions).toContain('Тон интервьюера: строгий');
    expect(instructions).toContain('требовательно');
    expect(instructions).toContain('даже если кандидат прямо просит объяснить');
    expect(instructions).toContain('«Давай»');
    expect(instructions).toContain('«На чём мы остановились?»');
    // Запрет повторять уже заданные уточнения — только в роли интервьюера.
    expect(instructions).toContain('НИКОГДА не повторяй уточняющий вопрос');
    expect(instructions).not.toContain('Профиль кандидата:');
    expect(instructions).not.toContain('не сохраняешь ответ');
  });

  it('builds candidate voice instructions for interviewer training', () => {
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'interviewer',
      candidatePersona: 'strong_brief',
      candidateDifficulty: 'realistic',
    });

    expect(instructions).toContain('Ты голосовой AI-кандидат Гласно');
    expect(instructions).toContain('Пользователь проводит интервью');
    expect(instructions).toContain('Отвечай как кандидат');
    expect(instructions).toContain('Никогда не отвечай как интервьюер');
    expect(instructions).toContain('не задавай вопросы от имени интервьюера');
    expect(instructions).not.toContain('Пол интервьюера:');
    expect(instructions).not.toContain('Тон интервьюера:');
    expect(instructions).not.toContain('Режим интервьюера:');
    expect(instructions).not.toContain('ты проверяешь кандидата');
  });

  it('uses the same mandatory candidate behavior contract in voice mode', () => {
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'interviewer',
      candidatePersona: 'overconfident',
      candidateDifficulty: 'challenging',
    });

    expect(instructions).toContain('ОБЯЗАТЕЛЬНЫЕ ПРОЯВЛЕНИЯ');
    expect(instructions).toContain('Длину ответа определяет выбранный профиль');
    expect(instructions).toContain('приписывай себе более широкий вклад');
    expect(instructions).toContain('не раскрывай противоречия добровольно');
  });

  it('does not reserve transition phrases for the app in interviewer training', () => {
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'interviewer',
      questionSourceMode: 'free',
    });

    expect(instructions).toContain('одним непрерывным разговором');
    expect(instructions).toContain('считай обычной частью разговора');
    expect(instructions).not.toContain('это команда приложению');
  });

  it('keeps transition phrases conversational even when the interviewer has a plan', () => {
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'interviewer',
      questionSourceMode: 'glasno',
      planQuestions: ['Расскажите про запуск продукта.', 'Как вы работаете с рисками?'],
    });

    expect(instructions).toContain('считай обычной частью разговора');
    expect(instructions).not.toContain('это команда приложению');
    expect(instructions).not.toContain('Текущий этап:');
  });

  it('gives the AI candidate the uploaded resume to play from', () => {
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'interviewer',
      resumeRaw: 'Иван, 10 лет во фронтенде: Vue, Nuxt, дизайн-система.',
      vacancyRaw: 'Ищем senior frontend с опытом Vue.',
    });

    // Без этого AI-кандидат выдумывал биографию, не связанную с файлом.
    expect(instructions).toContain('Твоё резюме');
    expect(instructions).toContain('10 лет во фронтенде');
    expect(instructions).toContain('не выдумывай фактов сверх него');
    expect(instructions).toContain('Описание вакансии: Ищем senior frontend');
  });

  it('tells the AI candidate not to invent facts when no resume was uploaded', () => {
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'interviewer',
      resumeRaw: null,
    });

    expect(instructions).toContain('Резюме кандидата не загружено');
    expect(instructions).not.toContain('Твоё резюме');
    // Пустое описание вакансии не должно оставлять пустых строк.
    expect(instructions).not.toContain('\n\n');
  });

  it('gives the AI interviewer the candidate resume in candidate training', () => {
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'candidate',
      resumeRaw: 'Пётр, 5 лет в B2B-продажах, CRM.',
    });

    expect(instructions).toContain('Резюме кандидата');
    expect(instructions).toContain('5 лет в B2B-продажах');
    expect(instructions).toContain('опирайся на него в вопросах');
    // В режиме кандидата AI — интервьюер, резюме не его биография.
    expect(instructions).not.toContain('Твоё резюме');
  });

  it('keeps a full-size resume instead of cutting it after the latest job', () => {
    // Резюме идут от свежего к старому: короткий лимит оставлял модели только
    // последнее место работы, и остальной опыт для неё не существовал.
    const resume = Array.from(
      { length: 40 },
      (_, index) => `Место работы ${index + 1}: подробное описание задач.`
    ).join(' ');
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'interviewer',
      resumeRaw: resume,
    });

    expect(resume.length).toBeGreaterThan(1500);
    expect(instructions).toContain('Место работы 1:');
    expect(instructions).toContain('Место работы 40:');
    expect(instructions).not.toContain('…');
  });

  it('truncates an oversized resume on a sentence boundary', () => {
    const resume = Array.from(
      { length: 400 },
      (_, index) => `Проект ${index + 1} с описанием результата.`
    ).join(' ');
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'interviewer',
      resumeRaw: resume,
    });

    expect(resume.length).toBeGreaterThan(6000);
    expect(instructions).toContain('…');
    // Обрыв не должен приходиться на середину слова.
    expect(instructions).not.toMatch(/[А-Яа-я]…/u);
  });

  it('keeps the vacancy description on a tighter budget than the resume', () => {
    const long = 'Требование к кандидату номер один. '.repeat(300);
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'interviewer',
      resumeRaw: null,
      vacancyRaw: long,
    });

    const vacancyLine = instructions
      .split('\n')
      .find((line) => line.startsWith('Описание вакансии:'));
    expect(vacancyLine!.length).toBeLessThan(1800);
  });

  it('passes the interviewer plan as a read-only reference', () => {
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'interviewer',
      planQuestions: ['Расскажите про запуск продукта.'],
    });

    expect(instructions).toContain('по своему плану');
    expect(instructions).toContain('1) Расскажите про запуск продукта.');
    expect(instructions).toContain('Не управляй порядком');
  });

  it('tells the AI candidate there is no plan when the interviewer has none', () => {
    const instructions = buildRealtimeInstructions({
      ...context,
      trainingMode: 'interviewer',
      planQuestions: [],
    });

    expect(instructions).toContain('нет заранее составленного плана');
  });

  it('includes interviewer gender grammar instruction', () => {
    const instructions = buildRealtimeInstructions({
      ...context,
      interviewerGender: 'female',
    });

    expect(instructions).toContain('женский');
    expect(instructions).toContain('поняла');
  });

  it('builds an OpenAI Realtime session payload with audio modalities', () => {
    const payload = buildRealtimeSessionPayload(context, {
      model: 'gpt-realtime',
      voice: 'marin',
      transcriptionModel: 'gpt-4o-mini-transcribe',
    });

    expect(payload).toMatchObject({
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        audio: {
          input: {
            transcription: {
              model: 'gpt-4o-mini-transcribe',
            },
            turn_detection: {
              type: 'semantic_vad',
              // Ответ ассистента создаёт клиент явно после транскрипта —
              // иначе модель успевает заговорить на команду «следующий вопрос».
              create_response: false,
              interrupt_response: false,
            },
          },
          output: {
            voice: 'marin',
          },
        },
      },
    });
    expect(payload.session.instructions).toContain('Product Manager');
  });

  it('builds the realtime context from interview state, deriving gender from the face id', () => {
    const state = {
      session: {
        id: 'session_1',
        trainingMode: 'candidate' as const,
        questionSourceMode: 'glasno' as const,
        role: 'Product Manager',
        level: 'senior',
        interviewerMode: 'strict' as const,
        interviewerFaceId: 'female-neutral' as const,
        candidatePersona: 'anxious' as const,
        candidateDifficulty: 'challenging' as const,
        candidateNotes: 'Второй раунд собеседования.',
        vacancyTitle: 'Senior Product Manager',
        companyName: 'Glasno',
      },
      currentTurn: {
        question: 'Расскажите о запуске сложного продукта.',
      },
    };

    expect(buildRealtimeContextFromState(state)).toEqual({
      sessionId: 'session_1',
      trainingMode: 'candidate',
      questionSourceMode: 'glasno',
      role: 'Product Manager',
      level: 'senior',
      interviewerMode: 'strict',
      interviewerGender: 'female',
      candidatePersona: 'anxious',
      candidateDifficulty: 'challenging',
      candidateNotes: 'Второй раунд собеседования.',
      vacancyTitle: 'Senior Product Manager',
      companyName: 'Glasno',
      currentQuestion: 'Расскажите о запуске сложного продукта.',
      planQuestions: [],
      resumeRaw: null,
      vacancyRaw: null,
    });
  });

  it('carries the interview background into the realtime context', () => {
    const context = buildRealtimeContextFromState(
      {
        session: {
          id: 'session_bg',
          trainingMode: 'interviewer',
          role: 'Frontend-разработчик',
          interviewerMode: 'neutral',
          vacancyTitle: 'Senior Frontend',
          companyName: 'Glasno',
        },
        currentTurn: { question: 'Интервью по плану' },
      },
      { resumeRaw: '10 лет во фронтенде, Vue и Nuxt.', vacancyRaw: 'Нужен Vue.' }
    );

    expect(context.resumeRaw).toBe('10 лет во фронтенде, Vue и Nuxt.');
    expect(context.vacancyRaw).toBe('Нужен Vue.');
  });

  it('falls back to an empty current question when there is no active turn', () => {
    const state = {
      session: {
        id: 'session_2',
        role: null,
        level: null,
        interviewerMode: 'neutral' as const,
        vacancyTitle: null,
        companyName: null,
      },
      currentTurn: null,
    };

    expect(buildRealtimeContextFromState(state).currentQuestion).toBe('');
    expect(buildRealtimeContextFromState(state).interviewerGender).toBe(
      'male'
    );
  });
});
