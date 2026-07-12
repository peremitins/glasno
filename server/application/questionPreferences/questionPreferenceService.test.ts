import { describe, expect, it } from 'vitest';
import { QuestionPreferenceService } from './questionPreferenceService';

function createFixture(overrides: Record<string, unknown> = {}) {
  const preferences: any[] = [];
  const session = {
    id: 'session_1',
    anonymousSessionId: 'anon_1',
    userId: null,
    trainingMode: 'candidate',
    role: 'Frontend-разработчик',
    level: 'middle',
    vacancyRaw: 'Vue, TypeScript',
    metadata: { focus: 'professional' },
    ...overrides,
  };
  const turn = {
    id: 'turn_1',
    sessionId: 'session_1',
    kind: 'main',
    question: 'Как браузер строит DOM и CSSOM?',
    metadata: {
      semantic: {
        conceptKey: 'browser_rendering',
        conceptLabel: 'Построение DOM и CSSOM',
        topicTags: ['dom', 'cssom'],
        requiredContextTags: [],
        focus: 'professional',
      },
    },
  };
  const repository = {
    preferences,
    async upsert(input: any) {
      const existing = preferences.find(
        (item) =>
          item.conceptKey === input.conceptKey &&
          item.roleKey === input.roleKey &&
          item.level === input.level
      );
      if (existing) {
        Object.assign(existing, input, { updatedAt: new Date() });
        return existing;
      }
      const created = {
        id: `preference_${preferences.length + 1}`,
        practiceCount: 0,
        lastPracticedAt: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        updatedAt: new Date('2026-07-12T00:00:00.000Z'),
        ...input,
      };
      preferences.push(created);
      return created;
    },
    async listForOwner() {
      return preferences;
    },
    async updateStatus(id: string, _owner: any, status: string) {
      const item = preferences.find((candidate) => candidate.id === id);
      if (!item) return null;
      item.status = status;
      return item;
    },
    async delete(id: string) {
      const index = preferences.findIndex((candidate) => candidate.id === id);
      if (index < 0) return false;
      preferences.splice(index, 1);
      return true;
    },
  };
  const interviewRepository = {
    async findSessionById() {
      return session;
    },
    async findTurnById() {
      return turn;
    },
    async updateTurnMetadata(_sessionId: string, _turnId: string, metadata: any) {
      turn.metadata = metadata;
      return turn;
    },
  };
  const service = new QuestionPreferenceService({
    repository: repository as any,
    interviewRepository: interviewRepository as any,
  });
  return { service, repository, turn };
}

describe('QuestionPreferenceService', () => {
  it('stores a semantic preference for an owned main candidate question', async () => {
    const { service, repository, turn } = createFixture();

    const result = await service.setForTurn({
      anonymousSessionId: 'anon_1',
      userId: null,
      sessionId: 'session_1',
      input: { turnId: 'turn_1', status: 'repeat' },
    });

    expect(result).toMatchObject({
      status: 'repeat',
      question: 'Как браузер строит DOM и CSSOM?',
      semantic: { conceptKey: 'browser_rendering' },
      roleKey: 'it-frontend',
      level: 'middle',
    });
    expect(repository.preferences).toHaveLength(1);
    expect(turn.metadata).toMatchObject({
      preference: { id: 'preference_1', status: 'repeat' },
    });
  });

  it('does not allow preferences for clarification turns', async () => {
    const { service, turn } = createFixture();
    turn.kind = 'clarification';

    await expect(
      service.setForTurn({
        anonymousSessionId: 'anon_1',
        userId: null,
        sessionId: 'session_1',
        input: { turnId: 'turn_1', status: 'repeat' },
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('does not allow preferences in interviewer training mode', async () => {
    const { service } = createFixture({ trainingMode: 'interviewer' });

    await expect(
      service.setForTurn({
        anonymousSessionId: 'anon_1',
        userId: null,
        sessionId: 'session_1',
        input: { turnId: 'turn_1', status: 'hidden' },
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
