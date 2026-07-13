import { describe, expect, it } from 'vitest';
import {
  AuthProfileResponseDto,
  EmailLoginVerifyRequestDto,
  UpdateProfileRequestDto,
} from './auth';

describe('DTO профиля', () => {
  it('принимает необязательное имя при проверке email-кода и нормализует пробелы', () => {
    expect(
      EmailLoginVerifyRequestDto.parse({
        email: 'candidate@example.com',
        code: '123456',
        displayName: '  Анна  ',
      })
    ).toMatchObject({ displayName: 'Анна' });

    expect(
      EmailLoginVerifyRequestDto.parse({
        email: 'candidate@example.com',
        code: '123456',
      })
    ).not.toHaveProperty('displayName');
  });

  it('ограничивает имя 80 символами и допускает очистку профиля', () => {
    expect(() =>
      EmailLoginVerifyRequestDto.parse({
        email: 'candidate@example.com',
        code: '123456',
        displayName: 'а'.repeat(81),
      })
    ).toThrow();

    expect(
      UpdateProfileRequestDto.parse({ displayName: '   ' })
    ).toEqual({ displayName: '' });
    expect(UpdateProfileRequestDto.parse({ displayName: null })).toEqual({
      displayName: null,
    });
  });

  it('возвращает профиль с приватным URL аватара', () => {
    expect(
      AuthProfileResponseDto.parse({
        user: {
          id: 'user_1',
          email: 'candidate@example.com',
          telegramId: null,
          telegramUsername: null,
          displayName: 'Анна',
          avatarUrl: '/api/auth/profile/avatar?v=version_1',
          role: 'user',
          onboarding: { interviewExplainSelection: false },
          emailVerifiedAt: '2026-07-13T10:00:00.000Z',
          createdAt: '2026-07-13T10:00:00.000Z',
        },
      })
    ).toMatchObject({
      user: { avatarUrl: '/api/auth/profile/avatar?v=version_1' },
    });
  });
});
