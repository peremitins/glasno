import type {
  QuestionBankItem,
  QuestionBankListQuery,
  QuestionBankListResponse,
} from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import type {
  QuestionBankRecord,
  QuestionBankRepository,
} from '@/server/interface/questionBankRepository';
import { QUESTION_BANK_SEED } from './seed';

export class QuestionBankService {
  constructor(
    private readonly deps: {
      repository: QuestionBankRepository;
    }
  ) {}

  async listPublic(
    filters: QuestionBankListQuery
  ): Promise<QuestionBankListResponse> {
    const rows = await this.deps.repository.listPublic(filters);
    const items = rows.length > 0
      ? rows.map(recordToDto)
      : filterSeed(filters);

    return {
      items,
      facets: {
        domains: unique(items.map((item) => item.domain)),
        roles: unique(items.map((item) => item.role).filter(Boolean) as string[]),
        types: unique(items.map((item) => item.type)),
      },
    };
  }

  async findPublicBySlug(slug: string): Promise<QuestionBankItem> {
    const row = await this.deps.repository.findPublicBySlug(slug);
    if (row) return recordToDto(row);

    const seeded = QUESTION_BANK_SEED.find((item) => item.slug === slug);
    if (seeded) return seeded;

    throw apiError('E_NOT_FOUND', 'Вопрос не найден');
  }

  async findRelated(item: QuestionBankItem): Promise<QuestionBankItem[]> {
    const list = await this.listPublic({ domain: item.domain });
    return list.items
      .filter((candidate) => candidate.slug !== item.slug)
      .slice(0, 3);
  }
}

function recordToDto(row: QuestionBankRecord): QuestionBankItem {
  return {
    id: row.id,
    slug: row.slug || slugify(row.question),
    domain: row.domain,
    domainLabel: domainLabel(row.domain),
    role: row.role,
    type: row.type,
    typeLabel: typeLabel(row.type),
    difficulty: row.difficulty,
    question: row.question,
    strongAnswer: row.strongAnswer,
    commonMistakes: row.commonMistakes,
    isPublic: row.isPublic,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

function filterSeed(filters: QuestionBankListQuery): QuestionBankItem[] {
  const q = filters.q?.toLowerCase();
  return QUESTION_BANK_SEED.filter((item) => {
    if (filters.domain && item.domain !== filters.domain) return false;
    if (filters.role && item.role !== filters.role) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (q) {
      const haystack = [item.question, item.role, item.domainLabel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function unique<T extends string>(items: T[]): T[] {
  return Array.from(new Set(items)).sort((left, right) =>
    left.localeCompare(right, 'ru')
  );
}

function domainLabel(domain: string): string {
  const labels: Record<string, string> = {
    product: 'Product',
    sales: 'Продажи',
    engineering: 'Разработка',
    career: 'Карьера',
  };
  return labels[domain] || domain;
}

function typeLabel(type: QuestionBankItem['type']): string {
  const labels: Record<QuestionBankItem['type'], string> = {
    hr: 'HR',
    behavioral: 'Поведенческий',
    professional: 'Профессиональный',
    stress: 'Стресс-вопрос',
  };
  return labels[type];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

