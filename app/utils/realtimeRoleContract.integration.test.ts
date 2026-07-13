import { describe, expect, it } from 'vitest';
import type { InterviewStateResponse } from '@/shared/dto';
import {
  buildRealtimeContextFromState,
  buildRealtimeInstructions,
} from '@/server/application/realtime/realtimeConfig';
import { withRealtimeSessionInstructions } from '@/app/composables/useRealtimeVoiceSession';
import { buildRealtimeResponseCreateEvent } from './interviewModeBridgeContext';

describe('realtime role contract', () => {
  it('preserves the full female strict interviewer role after a contaminated dialogue and «Давай»', () => {
    const state = {
      session: {
        id: 'session_role_regression',
        trainingMode: 'candidate',
        role: 'Frontend-разработчик',
        level: 'middle',
        interviewerMode: 'strict',
        interviewerFaceId: 'female-strict',
        companyName: null,
        vacancyTitle: null,
      },
      currentTurn: {
        id: 'turn_role_regression',
        index: 1,
        kind: 'main',
        question: 'Как вы оптимизируете загрузку React-приложения?',
        messages: [
          {
            role: 'interviewer',
            content: 'Если хотите, можем подробнее разобрать lazy loading.',
            at: '2026-07-13T13:40:40.000Z',
          },
          {
            role: 'user',
            content: 'Давай.',
            at: '2026-07-13T13:40:45.000Z',
          },
        ],
      },
      turns: [
        {
          id: 'turn_role_regression',
          index: 1,
          kind: 'main',
          question: 'Как вы оптимизируете загрузку React-приложения?',
        },
      ],
    } as InterviewStateResponse;
    const sessionInstructions = buildRealtimeInstructions(
      buildRealtimeContextFromState(state)
    );
    const responseEvent = buildRealtimeResponseCreateEvent({ state });
    const merged = withRealtimeSessionInstructions(
      responseEvent,
      sessionInstructions
    );
    const instructions = (
      merged.response as { instructions: string }
    ).instructions;

    expect(instructions).toContain('Ты голосовой интервьюер Гласно');
    expect(instructions).toContain('Тон интервьюера: строгий');
    expect(instructions).toContain('Пол интервьюера: женский');
    expect(instructions).toContain(
      'даже если кандидат прямо просит объяснить, отвечает «Давай»'
    );
    expect(instructions).toContain(
      'Интервьюер: Если хотите, можем подробнее разобрать lazy loading.'
    );
    expect(instructions).toContain('Кандидат: Давай.');
    expect(instructions).toContain(
      'не продолжай ошибочную обучающую реплику и немедленно вернись к роли интервьюера'
    );
    expect(instructions).not.toContain('Профиль кандидата:');
  });
});
