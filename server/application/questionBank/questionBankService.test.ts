import { describe, expect, it, vi } from 'vitest';
import { QuestionBankService } from './questionBankService';

describe('QuestionBankService', () => {
  it('returns curated seed questions when database is empty', async () => {
    const service = new QuestionBankService({
      repository: {
        listPublic: vi.fn().mockResolvedValue([]),
        findPublicBySlug: vi.fn(),
      },
    });

    const response = await service.listPublic({});

    expect(response.items.length).toBeGreaterThan(3);
    expect(response.facets.domains).toContain('product');
    expect(response.items[0]).toMatchObject({
      slug: expect.any(String),
      isPublic: true,
    });
  });

  it('finds a seeded public question by slug', async () => {
    const service = new QuestionBankService({
      repository: {
        listPublic: vi.fn().mockResolvedValue([]),
        findPublicBySlug: vi.fn().mockResolvedValue(null),
      },
    });

    const question = await service.findPublicBySlug('product-manager-priorities');

    expect(question).toMatchObject({
      slug: 'product-manager-priorities',
      role: 'Product Manager',
    });
  });
});

