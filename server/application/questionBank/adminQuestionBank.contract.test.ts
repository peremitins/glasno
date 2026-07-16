import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('admin question bank contract', () => {
  it('extends the database schema for the canonical corpus', () => {
    const schema = read('server/infrastructure/db/schema.ts');

    for (const column of [
      'corpusId',
      'framework',
      'topic',
      'subtopic',
      'interviewType',
      'seniority',
      'difficultyLevel',
      'variants',
      'answerFormat',
      'tags',
      'expectedConcepts',
      'technicalReview',
      'editorialReview',
      'provenance',
    ]) {
      expect(schema).toContain(`${column}:`);
    }
    expect(schema).toContain("index('question_bank_selection_idx')");
  });

  it('has an admin-only API and an idempotent canonical import command', () => {
    const apiPath = 'server/api/admin/question-bank/index.get.ts';
    const seedPath = 'scripts/seed-question-bank.ts';

    expect(existsSync(apiPath)).toBe(true);
    expect(existsSync(seedPath)).toBe(true);
    expect(read(apiPath)).toContain("requireRole(session?.role, 'admin')");
    expect(read(seedPath)).toContain('onConflictDoUpdate');
    expect(read(seedPath)).toContain('notInArray');
    expect(read(seedPath)).toContain('frontend-v1.jsonl');
    expect(read('package.json')).toContain('db:seed-question-bank');

    const corpus = read('data/question-bank/frontend-v1.jsonl')
      .trim()
      .split('\n');
    expect(corpus.length).toBeGreaterThanOrEqual(300);
    expect(corpus.length).toBeLessThan(600);
  });
});
