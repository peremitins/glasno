import { describe, expect, it, vi } from 'vitest';
import { QuestionCatalogService } from './questionCatalogService';

describe('QuestionCatalogService', () => {
  it('strips provenance for users and filters rows by a saved status', async () => {
    const list = vi.fn(async (_query, options) => ({ options }));
    const service = new QuestionCatalogService({
      questionBankService: { list } as never,
      preferenceRepository: {
        async listForOwner() {
          return [
            { conceptKey: 'frontend_vue_refs', status: 'repeat' },
            { conceptKey: 'frontend_vue_router', status: 'mastered' },
          ];
        },
      } as never,
    });

    await service.list({
      anonymousSessionId: 'anon_1',
      userId: null,
      isAdmin: false,
      query: { page: 1, pageSize: 25, preferenceStatus: 'repeat' },
    });

    expect(list).toHaveBeenCalledWith(
      { page: 1, pageSize: 25 },
      expect.objectContaining({
        includeProvenance: false,
        reviewedOnly: true,
        conceptKeys: ['frontend_vue_refs'],
      })
    );
  });

  it('keeps editorial provenance for admins', async () => {
    const list = vi.fn(async (_query, options) => ({ options }));
    const service = new QuestionCatalogService({
      questionBankService: { list } as never,
      preferenceRepository: {
        async listForOwner() {
          return [];
        },
      } as never,
    });

    await service.list({
      anonymousSessionId: 'admin_session',
      userId: 'admin_1',
      isAdmin: true,
      query: { page: 1, pageSize: 25 },
    });

    expect(list).toHaveBeenCalledWith(
      { page: 1, pageSize: 25 },
      expect.objectContaining({
        includeProvenance: true,
        reviewedOnly: false,
      })
    );
  });
});
