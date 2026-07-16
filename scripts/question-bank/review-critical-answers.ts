import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { z } from 'zod';

config({ path: '.env.development' });
config();

const CORPUS_PATH = resolve(
  process.cwd(),
  'data/question-bank/frontend-v1.jsonl'
);
const MODEL = process.env.QUESTION_BANK_REVIEW_MODEL ?? 'gpt-5.4-mini';
const SECURITY_PATTERN =
  /security|xss|csrf|csp|auth|oauth|privacy|cookie|supply.chain|vulnerab|безопас/i;

const SourceDto = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  sourceType: z.enum(['official_docs', 'standard']),
});
const ReviewItemDto = z.object({
  id: z.string().min(1),
  answer: z.string().min(40),
  sources: z.array(SourceDto).min(1).max(3),
  correctionSummary: z.string().nullable(),
  approved: z.literal(true),
});
const ReviewBatchDto = z.object({ items: z.array(ReviewItemDto) });

interface CorpusItem {
  id: string;
  framework: string;
  topic: string;
  subtopic: string | null;
  interviewType: string;
  seniority: string;
  question: string;
  answer: string;
  tags: string[];
  expectedConcepts: string[];
  provenance: {
    changesSummary: string | null;
    answerSources: z.infer<typeof SourceDto>[];
    answerVerifiedAt: string | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'answer',
          'sources',
          'correctionSummary',
          'approved',
        ],
        properties: {
          id: { type: 'string' },
          answer: { type: 'string' },
          sources: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'url', 'sourceType'],
              properties: {
                name: { type: 'string' },
                url: { type: 'string' },
                sourceType: {
                  type: 'string',
                  enum: ['official_docs', 'standard'],
                },
              },
            },
          },
          correctionSummary: { type: ['string', 'null'] },
          approved: { type: 'boolean', enum: [true] },
        },
      },
    },
  },
} as const;

function isCritical(item: CorpusItem) {
  const searchable = [
    item.topic,
    item.subtopic,
    ...item.tags,
    ...item.expectedConcepts,
  ].join(' ');
  return (
    (item.seniority === 'senior' && item.framework !== 'none') ||
    item.interviewType === 'system_design' ||
    SECURITY_PATTERN.test(searchable)
  );
}

function normalizeSourceUrl(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  url.protocol = 'https:';
  for (const parameter of [...url.searchParams.keys()]) {
    if (parameter.startsWith('utm_')) url.searchParams.delete(parameter);
  }
  return url.toString();
}

function sanitizeAnswer(value: string) {
  return value
    .replace(/\s*\(\[[^\]]+\]\(https?:\/\/.*?\)\)/g, '')
    .replace(/\s*cite[^]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function promptFor(items: CorpusItem[]) {
  return [
    'Ты независимый технический рецензент frontend-интервью. Не доверяй переданному ответу: заново проверь каждый существенный факт веб-поиском по актуальной официальной документации, спецификации или стандарту.',
    'Особенно внимательно проверь версии API, безопасность, ограничения браузеров, SSR/hydration, конкурентный рендеринг, реактивность и архитектурные компромиссы.',
    'Верни окончательный краткий ответ по-русски. Исправь ошибку, устаревшую рекомендацию или вводящую в заблуждение категоричность, если найдёшь. Не вставляй ссылки внутрь answer.',
    'В sources оставь 1–3 прямые ссылки на первичные источники. correctionSummary — короткое описание исправления или null, если исходный ответ корректен. approved=true означает, что итоговая версия полностью проверена.',
    `Материалы: ${JSON.stringify(
      items.map((item) => ({
        id: item.id,
        question: item.question,
        currentAnswer: item.answer,
        expectedConcepts: item.expectedConcepts,
        currentSources: item.provenance.answerSources,
      }))
    )}`,
  ].join('\n\n');
}

async function reviewBatch(client: OpenAI, items: CorpusItem[]) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await client.responses.create({
        model: MODEL,
        reasoning: { effort: 'low' },
        tools: [{ type: 'web_search_preview', search_context_size: 'low' }],
        input: promptFor(items),
        text: {
          format: {
            type: 'json_schema',
            name: 'critical_frontend_answer_review',
            strict: true,
            schema: responseSchema,
          },
        },
        max_output_tokens: 12_000,
      });
      const parsed = ReviewBatchDto.parse(JSON.parse(response.output_text));
      const expectedIds = new Set(items.map((item) => item.id));
      const actualIds = new Set(parsed.items.map((item) => item.id));
      if (
        expectedIds.size !== actualIds.size ||
        [...expectedIds].some((id) => !actualIds.has(id))
      ) {
        throw new Error('Рецензент вернул неполный набор ответов');
      }
      return parsed.items.map((item) => ({
        ...item,
        answer: sanitizeAnswer(item.answer),
        sources: item.sources.map((source) => ({
          ...source,
          url: normalizeSourceUrl(source.url),
        })),
      }));
    } catch (error) {
      lastError = error;
      if (attempt < 3) continue;
    }
  }
  throw lastError;
}

async function main() {
  const apiKey = process.env.NUXT_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Не задан NUXT_OPENAI_API_KEY');

  const source = await readFile(CORPUS_PATH, 'utf8');
  const items = source
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as CorpusItem);
  const criticalItems = items.filter(isCritical);
  const batches = Array.from(
    { length: Math.ceil(criticalItems.length / 10) },
    (_, index) => criticalItems.slice(index * 10, (index + 1) * 10)
  );
  const client = new OpenAI({ apiKey });
  const reviewed = new Map<string, z.infer<typeof ReviewItemDto>>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(6, batches.length) }, async () => {
    while (cursor < batches.length) {
      const batchIndex = cursor;
      cursor += 1;
      const batch = batches[batchIndex];
      if (!batch) return;
      const result = await reviewBatch(client, batch);
      for (const item of result) reviewed.set(item.id, item);
      console.log(
        `Повторно проверено: ${reviewed.size}/${criticalItems.length} (пакет ${batchIndex + 1}/${batches.length})`
      );
    }
  });
  await Promise.all(workers);

  const reviewedAt = new Date().toISOString();
  let corrections = 0;
  const completed = items.map((item) => {
    const review = reviewed.get(item.id);
    if (!review) return item;
    if (review.correctionSummary) corrections += 1;
    return {
      ...item,
      answer: review.answer,
      provenance: {
        ...item.provenance,
        answerSources: review.sources,
        answerVerifiedAt: reviewedAt,
        changesSummary: [
          item.provenance.changesSummary,
          review.correctionSummary
            ? `Повторная техническая проверка: ${review.correctionSummary}`
            : 'Ответ прошёл повторную техническую проверку без исправлений.',
        ].join(' '),
      },
    };
  });

  await writeFile(
    CORPUS_PATH,
    `${completed.map((item) => JSON.stringify(item)).join('\n')}\n`,
    'utf8'
  );
  console.log(
    `Повторно проверено ${criticalItems.length} ответов, исправлено ${corrections}.`
  );
}

main().catch((error) => {
  console.error('Не удалось выполнить повторную проверку:', error);
  process.exitCode = 1;
});
