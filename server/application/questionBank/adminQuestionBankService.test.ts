import { describe, expect, it } from 'vitest';
import type {
  AdminQuestionBankMetadataRecord,
  AdminQuestionBankRecord,
} from '@/server/interface/adminQuestionBankRepository';
import { AdminQuestionBankService } from './adminQuestionBankService';

const record: AdminQuestionBankRecord = {
  id: 'db-id',
  corpusId: 'frontend_vue_reactivity',
  slug: 'vue-reactivity',
  role: 'Frontend Developer',
  framework: 'vue',
  topic: 'vue',
  subtopic: 'Реактивность',
  interviewType: 'technical',
  seniority: 'middle',
  difficultyLevel: 3,
  question: 'Как устроена реактивность во Vue 3?',
  variants: [],
  strongAnswer: null,
  answerFormat: null,
  tags: ['vue'],
  expectedConcepts: ['Proxy'],
  status: 'review',
  technicalReview: 'pending',
  editorialReview: 'passed',
  provenance: null,
  isPublic: false,
  createdAt: new Date('2026-07-15T00:00:00.000Z'),
  updatedAt: null,
};

const metadata: AdminQuestionBankMetadataRecord[] = [
  {
    role: 'Frontend Developer',
    framework: 'vue',
    topic: 'vue',
    interviewType: 'technical',
    seniority: 'middle',
    technicalReview: 'pending',
    editorialReview: 'passed',
    status: 'review',
    hasAnswer: false,
    isPublic: false,
  },
];

describe('AdminQuestionBankService', () => {
  it('maps records and builds counted facets', async () => {
    const service = new AdminQuestionBankService({
      repository: {
        listAdmin: async () => ({ rows: [record], total: 1 }),
        listAdminMetadata: async () => metadata,
      },
    });

    const response = await service.list({ page: 1, pageSize: 25 });

    expect(response.items[0]).toMatchObject({
      corpusId: 'frontend_vue_reactivity',
      difficulty: 3,
      answer: null,
    });
    expect(response.summary).toEqual({
      total: 1,
      withAnswers: 0,
      pendingTechnical: 1,
      published: 0,
    });
    expect(response.facets.frameworks).toEqual([{ value: 'vue', count: 1 }]);
  });
});
