import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORPUS_PATH = resolve(process.cwd(), 'data/question-bank/frontend-v1.jsonl');

const EXPECTED_TOPICS: Record<string, number> = {
  javascript: 110,
  web_platform: 85,
  typescript: 65,
  react: 65,
  vue: 75,
  angular: 55,
  engineering: 95,
  interview_practice: 50,
};

interface CorpusRecord {
  id: string;
  slug: string;
  language: string;
  originalLanguage: string;
  role: string;
  framework: string;
  topic: string;
  interviewType: string;
  seniority: string;
  difficulty: number;
  question: string;
  variants: string[];
  answer: string | null;
  answerFormat: string | null;
  tags: string[];
  expectedConcepts: string[];
  status: string;
  technicalReview: string;
  editorialReview: string;
  provenance: {
    sourceType: string;
    repositoryUrl: string | null;
    sourceFilePath: string | null;
    sourceCommitSha: string | null;
    licenseSpdx: string | null;
    importType: string;
    originalContentHash: string | null;
    answerSources: Array<{
      name: string;
      url: string;
      sourceType: 'official_docs' | 'standard';
    }>;
  };
}

function readCorpus(): CorpusRecord[] {
  return readFileSync(CORPUS_PATH, 'utf8')
    .trim()
    .split('\n')
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Строка ${index + 1} содержит невалидный JSON`);
      }
    });
}

describe('frontend question corpus v1', () => {
  it('contains a curated set of valid and unique records without a quantity quota', () => {
    const records = readCorpus();
    expect(records.length).toBeGreaterThanOrEqual(300);
    expect(records.length).toBeLessThan(600);
    expect(new Set(records.map((item) => item.id)).size).toBe(records.length);
    expect(new Set(records.map((item) => item.slug)).size).toBe(records.length);
  });

  it('keeps meaningful coverage in every approved topic', () => {
    const records = readCorpus();
    const byTopic = Object.fromEntries(
      Object.keys(EXPECTED_TOPICS).map((topic) => [
        topic,
        records.filter((item) => item.topic === topic).length,
      ])
    );
    for (const [topic, originalCount] of Object.entries(EXPECTED_TOPICS)) {
      expect(byTopic[topic], topic).toBeGreaterThan(0);
      expect(byTopic[topic], topic).toBeLessThanOrEqual(originalCount);
    }
  });

  it('does not keep wording variants as separate questions at the same level', () => {
    const records = readCorpus();
    const juniorTestingOverview = records.filter(
      (item) =>
        item.framework === 'none' &&
        item.seniority === 'junior' &&
        item.topic === 'engineering' &&
        /(?:unit|юнит).*(?:integration|интеграц).*(?:e2e|end-to-end)/i.test(
          item.question
        )
    );

    expect(juniorTestingOverview).toHaveLength(1);
  });

  it('assigns seniority by required competence instead of a quota', () => {
    const records = readCorpus();
    const advancedJuniorPattern =
      /CI\/CD|performance budgets?|RUM|синтетическ(?:ий|ое) мониторинг|наблюдаемост|инцидент|стратеги[ия] релиза|откат|микрофронтенд|monorepo|монорепозитор|Module Federation|hydration mismatch|несоответстви[ея] гидратации|heap snapshot|профилировани[ея] памяти|CSP|OAuth|threat model|модель угроз|WeakMap|WeakSet|Function\.prototype\.toString|passive event listener|SameSite|MutationObserver|алгоритм reconciliation/i;

    for (const item of records) {
      if (item.seniority === 'junior') {
        expect(item.difficulty, item.id).toBeLessThanOrEqual(2);
        expect(item.interviewType, item.id).not.toBe('system_design');
        expect(item.question, item.id).not.toMatch(advancedJuniorPattern);
      }
      if (item.seniority === 'middle') {
        expect(item.difficulty, item.id).toBeGreaterThanOrEqual(2);
        expect(item.difficulty, item.id).toBeLessThanOrEqual(4);
      }
      if (item.seniority === 'senior') {
        expect(item.difficulty, item.id).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('keeps every record reviewable and legally traceable', () => {
    const records = readCorpus();
    for (const item of records) {
      expect(item.id).toMatch(/^frontend_[a-z0-9_]+$/);
      expect(item.slug).toMatch(/^[a-z0-9-]+$/);
      expect(item.language).toBe('ru');
      expect(['ru', 'en']).toContain(item.originalLanguage);
      expect(item.role).toBe('frontend');
      expect(['none', 'react', 'vue', 'angular']).toContain(item.framework);
      expect(['technical', 'behavioral', 'live_coding', 'system_design']).toContain(
        item.interviewType
      );
      expect(['junior', 'middle', 'senior']).toContain(item.seniority);
      expect(item.difficulty).toBeGreaterThanOrEqual(1);
      expect(item.difficulty).toBeLessThanOrEqual(5);
      expect(item.question.length).toBeGreaterThanOrEqual(20);
      expect(Array.isArray(item.variants)).toBe(true);
      expect(Array.isArray(item.tags) && item.tags.length > 0).toBe(true);
      expect(
        Array.isArray(item.expectedConcepts) && item.expectedConcepts.length > 0
      ).toBe(true);
      expect(item.status).toBe('review');
      expect(['pending', 'passed', 'rejected']).toContain(item.technicalReview);
      expect(['pending', 'passed', 'rejected']).toContain(item.editorialReview);

      const provenance = item.provenance;
      expect(['open_source', 'official_docs', 'original']).toContain(
        provenance.sourceType
      );
      expect(['translated', 'adapted', 'original']).toContain(
        provenance.importType
      );
      if (provenance.sourceType === 'open_source') {
        expect(provenance.repositoryUrl).toMatch(/^https:\/\/github\.com\//);
        expect(provenance.sourceCommitSha).toMatch(/^[a-f0-9]{40}$/);
        expect(provenance.licenseSpdx).toMatch(/^(MIT|Unlicense|CC-BY-4\.0)$/);
      }
      if (item.answer !== null) {
        expect(item.answer.length).toBeGreaterThanOrEqual(40);
        expect(item.answer).not.toMatch(/utm_source=openai|cite/);
        expect(['plain', 'markdown']).toContain(item.answerFormat);
        expect(provenance.answerSources.length).toBeGreaterThan(0);
        for (const source of provenance.answerSources) {
          expect(source.name.length).toBeGreaterThan(0);
          expect(source.url).toMatch(/^https:\/\//);
          expect(['official_docs', 'standard']).toContain(source.sourceType);
        }
      } else {
        expect(item.answerFormat).toBeNull();
      }
    }
  });

  it('contains a sourced concise answer for every question', () => {
    const records = readCorpus();

    expect(records.filter((item) => item.answer === null)).toHaveLength(0);
    expect(
      records.filter((item) => item.provenance.answerSources.length === 0)
    ).toHaveLength(0);
    expect(
      records.filter((item) => item.technicalReview !== 'passed')
    ).toHaveLength(0);
  });

  it('is sorted by framework, topic, seniority and id', () => {
    const records = readCorpus();
    const keys = records.map((item) =>
      [item.framework, item.topic, item.seniority, item.id].join('|')
    );
    expect(keys).toEqual([...keys].sort((left, right) => left.localeCompare(right)));
  });
});
