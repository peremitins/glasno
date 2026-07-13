import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { normalizeAvatarImage } from '@/server/infrastructure/files/normalizeAvatarImage';
import type {
  AuthRepository,
  AuthUserRecord,
} from '@/server/interface/authRepository';
import type { AvatarImageProcessor } from '@/server/interface/avatarStorage';
import { AuthService } from './authService';

function createUser(overrides: Partial<AuthUserRecord> = {}): AuthUserRecord {
  return {
    id: 'user_1',
    email: 'candidate@example.com',
    telegramId: null,
    telegramUsername: null,
    displayName: 'Анна',
    avatarVersion: null,
    role: 'user' as const,
    onboarding: {},
    emailVerifiedAt: new Date('2026-07-13T10:00:00.000Z'),
    deletedAt: null,
    createdAt: new Date('2026-07-13T10:00:00.000Z'),
    updatedAt: new Date('2026-07-13T10:00:00.000Z'),
    ...overrides,
  };
}

function createRepository(user: AuthUserRecord = createUser()) {
  const calls: string[] = [];
  let tail = Promise.resolve();
  const repository = {
    calls,
    user,
    async withUserAvatarLock<T>(
      userId: string,
      callback: (lockedRepository: AuthRepository) => Promise<T>
    ): Promise<T> {
      calls.push(`lock:${userId}`);
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback(repository as never);
      } finally {
        release();
      }
    },
    async findUserById(userId: string) {
      calls.push('findUserById');
      return user.id === userId && !user.deletedAt ? user : null;
    },
    async updateDisplayName(userId: string, displayName: string | null) {
      calls.push('updateDisplayName');
      if (user.id !== userId || user.deletedAt) return null;
      user.displayName = displayName;
      return user;
    },
    async setAvatarVersion(userId: string, avatarVersion: string | null) {
      calls.push(`setAvatarVersion:${avatarVersion ?? 'null'}`);
      if (user.id !== userId || user.deletedAt) return null;
      user.avatarVersion = avatarVersion;
      return user;
    },
    async anonymizeUserAccount(userId: string) {
      calls.push('anonymizeUserAccount');
      if (user.id !== userId || user.deletedAt) return false;
      user.deletedAt = new Date();
      return true;
    },
  };
  return repository;
}

function createService(
  repository: ReturnType<typeof createRepository>,
  options: {
    deleteAvatar?: (userId: string) => Promise<void>;
    getAvatar?: (userId: string) => Promise<Buffer | null>;
    putAvatar?: (userId: string, data: Buffer) => Promise<void>;
    createAvatarVersion?: () => string;
    avatarImageProcessor?: AvatarImageProcessor;
  } = {}
) {
  const storage = {
    putAvatar: vi.fn(options.putAvatar ?? (async () => {})),
    getAvatar: vi.fn(options.getAvatar ?? (async () => Buffer.from([1]))),
    deleteAvatar: vi.fn(options.deleteAvatar ?? (async () => {})),
  };
  const service = new AuthService({
    repository: repository as never,
    sessionService: {} as never,
    authEmailCodeSecret: '',
    emailHashPepper: '',
    telegramBotToken: '',
    createAvatarStorage: () => storage,
    avatarImageProcessor:
      options.avatarImageProcessor ?? { normalize: normalizeAvatarImage },
    createAvatarVersion: options.createAvatarVersion ?? (() => 'avatar_v2'),
  });
  return { service, storage };
}

describe('AuthService: профиль и аватар', () => {
  it('очищает имя пустой строкой', async () => {
    const repository = createRepository();
    const { service } = createService(repository);

    await expect(service.updateProfile('user_1', '   ')).resolves.toMatchObject({
      displayName: null,
    });
    expect(repository.calls).toContain('updateDisplayName');
  });

  it('отклоняет поддельный MIME до сохранения аватара', async () => {
    const repository = createRepository();
    const { service, storage } = createService(repository);
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    await expect(
      service.uploadAvatar('user_1', { data: png, mimeType: 'image/jpeg' })
    ).rejects.toThrow('не совпадает');
    expect(storage.putAvatar).not.toHaveBeenCalled();
  });

  it('меняет версию после загрузки и отдаёт приватный URL', async () => {
    const repository = createRepository();
    const { service, storage } = createService(repository);
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .jpeg()
      .toBuffer();

    await expect(
      service.uploadAvatar('user_1', { data: jpeg, mimeType: 'image/jpeg' })
    ).resolves.toMatchObject({
      avatarUrl: '/api/auth/profile/avatar?v=avatar_v2',
    });
    expect(storage.putAvatar).toHaveBeenCalledWith(
      'user_1',
      expect.any(Buffer)
    );
  });

  it('удаляет объект и сохраняет исходную ошибку при сбое записи версии', async () => {
    const repository = createRepository();
    const { service, storage } = createService(repository);
    const databaseError = new Error('database write failed');
    repository.setAvatarVersion = async () => {
      throw databaseError;
    };
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    await expect(
      service.uploadAvatar('user_1', { data: png, mimeType: 'image/png' })
    ).rejects.toBe(databaseError);
    expect(storage.deleteAvatar).toHaveBeenCalledWith('user_1');
  });

  it('восстанавливает прежние байты при сбое записи версии во время замены', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v1' }));
    const previous = Buffer.from('previous-avatar');
    let object: Buffer | null = Buffer.from(previous);
    const databaseError = new Error('database write failed');
    const { service, storage } = createService(repository, {
      getAvatar: async () => (object ? Buffer.from(object) : null),
      putAvatar: async (_userId, data) => {
        object = Buffer.from(data);
      },
      deleteAvatar: async () => {
        object = null;
      },
    });
    repository.setAvatarVersion = async () => {
      throw databaseError;
    };
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    await expect(
      service.uploadAvatar('user_1', { data: png, mimeType: 'image/png' })
    ).rejects.toBe(databaseError);

    expect(object).toEqual(previous);
    expect(storage.putAvatar).toHaveBeenCalledTimes(2);
    expect(repository.user.avatarVersion).toBe('avatar_v1');
  });

  it('восстанавливает прежние байты после timeout ошибки put, уже изменившего объект', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v1' }));
    const previous = Buffer.from('previous-avatar');
    let object: Buffer | null = Buffer.from(previous);
    let putAttempts = 0;
    const { service, storage } = createService(repository, {
      getAvatar: async () => (object ? Buffer.from(object) : null),
      putAvatar: async (_userId, data) => {
        object = Buffer.from(data);
        putAttempts += 1;
        if (putAttempts === 1) {
          throw new Error('S3 request timed out after write');
        }
      },
      deleteAvatar: async () => {
        object = null;
      },
    });
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    await expect(
      service.uploadAvatar('user_1', { data: png, mimeType: 'image/png' })
    ).rejects.toThrow('Хранилище аватаров');

    expect(object).toEqual(previous);
    expect(storage.putAvatar).toHaveBeenCalledTimes(2);
    expect(repository.user.avatarVersion).toBe('avatar_v1');
  });

  it('компенсирует замену после ошибки commit, если транзакция откатила версию', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v1' }));
    const previous = Buffer.from('previous-avatar');
    let object: Buffer | null = Buffer.from(previous);
    const commitError = new Error('transaction commit failed');
    const originalWithUserAvatarLock = repository.withUserAvatarLock;
    let lockAttempts = 0;
    repository.withUserAvatarLock = async (userId, callback) => {
      lockAttempts += 1;
      if (lockAttempts === 1) {
        await callback(repository as never);
        repository.user.avatarVersion = 'avatar_v1';
        throw commitError;
      }
      return originalWithUserAvatarLock(userId, callback);
    };
    const { service, storage } = createService(repository, {
      getAvatar: async () => (object ? Buffer.from(object) : null),
      putAvatar: async (_userId, data) => {
        object = Buffer.from(data);
      },
      deleteAvatar: async () => {
        object = null;
      },
    });
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    await expect(
      service.uploadAvatar('user_1', { data: png, mimeType: 'image/png' })
    ).rejects.toBe(commitError);

    expect(lockAttempts).toBe(2);
    expect(object).toEqual(previous);
    expect(storage.putAvatar).toHaveBeenCalledTimes(2);
    expect(repository.user.avatarVersion).toBe('avatar_v1');
  });

  it('повторно удаляет объект при закрытии аккаунта после неудачного cleanup загрузки', async () => {
    const repository = createRepository();
    const calls: string[] = [];
    const databaseError = new Error('database write failed');
    let deleteAttempts = 0;
    const { service } = createService(repository, {
      putAvatar: async () => {
        calls.push('putAvatar');
      },
      deleteAvatar: async () => {
        deleteAttempts += 1;
        calls.push(`deleteAvatar:${deleteAttempts}`);
        if (deleteAttempts === 1) {
          throw new Error('cleanup storage offline');
        }
      },
    });
    repository.setAvatarVersion = async () => {
      calls.push('setAvatarVersion');
      throw databaseError;
    };
    const originalAnonymize = repository.anonymizeUserAccount;
    repository.anonymizeUserAccount = async (userId: string) => {
      calls.push('anonymizeUserAccount');
      return originalAnonymize(userId);
    };
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    await expect(
      service.uploadAvatar('user_1', { data: png, mimeType: 'image/png' })
    ).rejects.toBe(databaseError);
    await expect(service.deleteAccount('user_1')).resolves.toEqual({ ok: true });

    expect(calls).toEqual([
      'putAvatar',
      'setAvatarVersion',
      'deleteAvatar:1',
      'deleteAvatar:2',
      'anonymizeUserAccount',
    ]);
  });

  it('при повторной загрузке перезаписывает тот же объект и меняет версию URL', async () => {
    const repository = createRepository();
    const versions = ['avatar_v1', 'avatar_v2'];
    const { service, storage } = createService(repository, {
      createAvatarVersion: () => versions.shift()!,
    });
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    const webp = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .webp()
      .toBuffer();

    await expect(
      service.uploadAvatar('user_1', { data: png, mimeType: 'image/png' })
    ).resolves.toMatchObject({
      avatarUrl: '/api/auth/profile/avatar?v=avatar_v1',
    });
    await expect(
      service.uploadAvatar('user_1', { data: webp, mimeType: 'image/webp' })
    ).resolves.toMatchObject({
      avatarUrl: '/api/auth/profile/avatar?v=avatar_v2',
    });

    expect(storage.putAvatar).toHaveBeenNthCalledWith(
      1,
      'user_1',
      expect.any(Buffer)
    );
    expect(storage.putAvatar).toHaveBeenNthCalledWith(
      2,
      'user_1',
      expect.any(Buffer)
    );
    expect(repository.user.avatarVersion).toBe('avatar_v2');
  });

  it('удаляет объект и сразу очищает версию аватара', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v1' }));
    const { service, storage } = createService(repository);

    await expect(service.deleteAvatar('user_1')).resolves.toMatchObject({
      avatarUrl: null,
    });
    expect(storage.deleteAvatar).toHaveBeenCalledWith('user_1');
    expect(repository.calls).toContain('setAvatarVersion:null');
  });

  it('восстанавливает прежние байты, если очистка версии после удаления не записалась', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v1' }));
    const previous = Buffer.from('previous-avatar');
    let object: Buffer | null = Buffer.from(previous);
    const databaseError = new Error('database write failed');
    const { service, storage } = createService(repository, {
      getAvatar: async () => (object ? Buffer.from(object) : null),
      putAvatar: async (_userId, data) => {
        object = Buffer.from(data);
      },
      deleteAvatar: async () => {
        object = null;
      },
    });
    repository.setAvatarVersion = async () => {
      throw databaseError;
    };

    await expect(service.deleteAvatar('user_1')).rejects.toBe(databaseError);

    expect(object).toEqual(previous);
    expect(storage.putAvatar).toHaveBeenCalledWith('user_1', previous);
    expect(repository.user.avatarVersion).toBe('avatar_v1');
  });

  it('восстанавливает прежние байты после timeout ошибки delete, уже удалившей объект', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v1' }));
    const previous = Buffer.from('previous-avatar');
    let object: Buffer | null = Buffer.from(previous);
    let deleteAttempts = 0;
    const { service, storage } = createService(repository, {
      getAvatar: async () => (object ? Buffer.from(object) : null),
      putAvatar: async (_userId, data) => {
        object = Buffer.from(data);
      },
      deleteAvatar: async () => {
        object = null;
        deleteAttempts += 1;
        if (deleteAttempts === 1) {
          throw new Error('S3 request timed out after delete');
        }
      },
    });

    await expect(service.deleteAvatar('user_1')).rejects.toThrow(
      'Хранилище аватаров'
    );

    expect(object).toEqual(previous);
    expect(storage.putAvatar).toHaveBeenCalledWith('user_1', previous);
    expect(repository.user.avatarVersion).toBe('avatar_v1');
  });

  it('не анонимизирует аккаунт, если хранилище аватара недоступно', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v1' }));
    const { service } = createService(repository, {
      deleteAvatar: async () => {
        throw new Error('storage offline');
      },
    });

    await expect(service.deleteAccount('user_1')).rejects.toThrow(
      'Хранилище аватаров'
    );
    expect(repository.calls).toEqual(['lock:user_1', 'findUserById']);
  });

  it('удаляет объект до анонимизации аккаунта', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v1' }));
    const order: string[] = [];
    const { service } = createService(repository, {
      deleteAvatar: async () => {
        order.push('deleteAvatar');
      },
    });
    const originalAnonymize = repository.anonymizeUserAccount;
    repository.anonymizeUserAccount = async (userId: string) => {
      order.push('anonymizeUserAccount');
      return originalAnonymize(userId);
    };

    await expect(service.deleteAccount('user_1')).resolves.toEqual({ ok: true });
    expect(order).toEqual(['deleteAvatar', 'anonymizeUserAccount']);
  });

  it('восстанавливает аватар, если анонимизация аккаунта не записалась', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v1' }));
    const previous = Buffer.from('previous-avatar');
    let object: Buffer | null = Buffer.from(previous);
    const databaseError = new Error('database write failed');
    const { service, storage } = createService(repository, {
      getAvatar: async () => (object ? Buffer.from(object) : null),
      putAvatar: async (_userId, data) => {
        object = Buffer.from(data);
      },
      deleteAvatar: async () => {
        object = null;
      },
    });
    repository.anonymizeUserAccount = async () => {
      throw databaseError;
    };

    await expect(service.deleteAccount('user_1')).rejects.toBe(databaseError);

    expect(object).toEqual(previous);
    expect(storage.putAvatar).toHaveBeenCalledWith('user_1', previous);
    expect(repository.user.deletedAt).toBeNull();
  });

  it('не отдаёт аватар по устаревшей версии URL', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v2' }));
    const { service, storage } = createService(repository);

    await expect(service.getAvatar('user_1', 'avatar_v1')).rejects.toThrow(
      'Аватар не установлен'
    );
    expect(storage.getAvatar).not.toHaveBeenCalled();
  });

  it('держит блокировку до чтения байтов, чтобы старый URL не получил новый объект', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v1' }));
    const previous = Buffer.from('previous-avatar');
    let object: Buffer | null = Buffer.from(previous);
    let releaseUpload!: () => void;
    const uploadStarted = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    let continueUpload!: () => void;
    const waitForUpload = new Promise<void>((resolve) => {
      continueUpload = resolve;
    });
    const { service, storage } = createService(repository, {
      avatarImageProcessor: { normalize: async () => Buffer.from('new-avatar') },
      getAvatar: async () => (object ? Buffer.from(object) : null),
      putAvatar: async (_userId, data) => {
        object = Buffer.from(data);
        releaseUpload();
        await waitForUpload;
      },
      deleteAvatar: async () => {
        object = null;
      },
    });

    const upload = service.uploadAvatar('user_1', {
      data: Buffer.from('source'),
      mimeType: 'image/png',
    });
    await uploadStarted;
    storage.getAvatar.mockClear();

    const oldVersionRead = service.getAvatar('user_1', 'avatar_v1');
    await Promise.resolve();
    expect(storage.getAvatar).not.toHaveBeenCalled();

    continueUpload();
    await upload;
    await expect(oldVersionRead).rejects.toThrow('Аватар не установлен');
  });

  it('сериализует замену и удаление, чтобы после удаления не оставался объект', async () => {
    const repository = createRepository();
    const order: string[] = [];
    let releaseUpload!: () => void;
    const uploadStarted = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    let continueUpload!: () => void;
    const waitForUpload = new Promise<void>((resolve) => {
      continueUpload = resolve;
    });
    const { service, storage } = createService(repository, {
      putAvatar: async () => {
        order.push('put:start');
        releaseUpload();
        await waitForUpload;
        order.push('put:end');
      },
      deleteAvatar: async () => {
        order.push('delete');
      },
    });
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    const upload = service.uploadAvatar('user_1', {
      data: png,
      mimeType: 'image/png',
    });
    await uploadStarted;
    const deletion = service.deleteAvatar('user_1');

    await Promise.resolve();
    expect(storage.deleteAvatar).not.toHaveBeenCalled();
    continueUpload();

    await upload;
    await deletion;
    expect(order).toEqual(['put:start', 'put:end', 'delete']);
    expect(repository.user.avatarVersion).toBeNull();
  });

  it('не загружает новый объект после параллельного удаления аккаунта', async () => {
    const repository = createRepository(createUser({ avatarVersion: 'avatar_v1' }));
    const order: string[] = [];
    let releaseDeletion!: () => void;
    const deletionStarted = new Promise<void>((resolve) => {
      releaseDeletion = resolve;
    });
    let continueDeletion!: () => void;
    const waitForDeletion = new Promise<void>((resolve) => {
      continueDeletion = resolve;
    });
    const { service, storage } = createService(repository, {
      deleteAvatar: async () => {
        order.push('delete:start');
        releaseDeletion();
        await waitForDeletion;
        order.push('delete:end');
      },
    });
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    const accountDeletion = service.deleteAccount('user_1');
    await deletionStarted;
    const upload = service.uploadAvatar('user_1', {
      data: png,
      mimeType: 'image/png',
    });

    continueDeletion();
    await accountDeletion;
    await expect(upload).rejects.toThrow('Аккаунт не найден');
    expect(order).toEqual(['delete:start', 'delete:end']);
    expect(storage.putAvatar).not.toHaveBeenCalled();
  });
});
