import { describe, expect, it } from 'vitest';
import type {
  AuthRepository,
  AuthUserRecord,
} from '@/server/interface/authRepository';
import { AuthService } from './authService';

function createUser(): AuthUserRecord {
  return {
    id: 'user_1',
    email: 'candidate@example.com',
    telegramId: null,
    telegramUsername: null,
    displayName: null,
    avatarVersion: 'avatar_v1',
    role: 'user',
    onboarding: {},
    emailVerifiedAt: new Date('2026-07-13T10:00:00.000Z'),
    deletedAt: null,
    createdAt: new Date('2026-07-13T10:00:00.000Z'),
    updatedAt: new Date('2026-07-13T10:00:00.000Z'),
  };
}

describe('AuthService: таймаут хранилища аватара', () => {
  it('преобразует таймаут S3 в E_UPSTREAM', async () => {
    const user = createUser();
    const repository = {
      async withUserAvatarLock<T>(
        _userId: string,
        callback: (lockedRepository: AuthRepository) => Promise<T>
      ): Promise<T> {
        return callback(repository as unknown as AuthRepository);
      },
      async findUserById(userId: string) {
        return userId === user.id ? user : null;
      },
      async setAvatarVersion() {
        return user;
      },
    };
    const service = new AuthService({
      repository: repository as unknown as AuthRepository,
      sessionService: {} as never,
      authEmailCodeSecret: '',
      emailHashPepper: '',
      telegramBotToken: '',
      createAvatarStorage: () => ({
        putAvatar: async () => {},
        getAvatar: async () => null,
        deleteAvatar: async () => {
          throw new DOMException(
            'S3-запрос превысил допустимое время',
            'TimeoutError'
          );
        },
      }),
    });

    await expect(service.deleteAvatar(user.id)).rejects.toMatchObject({
      statusCode: 502,
      data: { code: 'E_UPSTREAM' },
    });
  });
});
