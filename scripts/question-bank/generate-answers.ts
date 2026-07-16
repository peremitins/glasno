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
const PROGRESS_PATH = resolve('/tmp/jobai-question-bank-answers.json');
const MODEL = process.env.QUESTION_BANK_ANSWER_MODEL ?? 'gpt-5.4-mini';
const BATCH_SIZE = 10;
const CONCURRENCY = Number(process.env.QUESTION_BANK_ANSWER_CONCURRENCY ?? 8);

const SourceDto = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  sourceType: z.enum(['official_docs', 'standard']),
});

const GeneratedAnswerDto = z.object({
  id: z.string().min(1),
  answer: z.string().min(40),
  sources: z.array(SourceDto).min(1).max(3),
  verified: z.literal(true),
  uncertainty: z.null(),
});

const GeneratedBatchDto = z.object({
  items: z.array(GeneratedAnswerDto),
});

interface CorpusItem {
  id: string;
  topic: string;
  framework: string;
  interviewType: string;
  seniority: string;
  question: string;
  expectedConcepts: string[];
  answer: string | null;
  answerFormat: 'plain' | 'markdown' | null;
  technicalReview: 'pending' | 'passed' | 'rejected';
  provenance: {
    changesSummary: string | null;
    answerSources?: z.infer<typeof SourceDto>[];
    answerVerifiedAt?: string | null;
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
          'verified',
          'uncertainty',
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
          verified: { type: 'boolean', enum: [true] },
          uncertainty: { type: 'null' },
        },
      },
    },
  },
} as const;

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
    'Ты технический редактор русскоязычного банка вопросов для frontend-интервью.',
    'Для каждого вопроса сначала найди и проверь факты по актуальной официальной документации, спецификации или стандарту. Не используй блоги, форумы, коммерческие каталоги и память без проверки.',
    'Ответ должен быть самостоятельным, точным и естественным по-русски: обычно 2–5 предложений, без вводной воды. Если вопрос просит код, добавь минимальный корректный пример. Не вставляй ссылки и сноски внутрь answer.',
    'Учитывай ожидаемые концепты, но исправляй их, если они устарели или технически неточны. Для поведенческих и system design вопросов дай краткую структуру сильного ответа и проверяй технические рекомендации по первичным источникам.',
    'В sources укажи 1–3 прямые HTTPS-ссылки только на официальную документацию или стандарт, которые подтверждают ответ. verified=true допустимо только если весь ответ подтверждён; иначе не возвращай элемент и тем самым останови импорт.',
    `Вопросы: ${JSON.stringify(
      items.map((item) => ({
        id: item.id,
        topic: item.topic,
        framework: item.framework,
        interviewType: item.interviewType,
        seniority: item.seniority,
        question: item.question,
        expectedConcepts: item.expectedConcepts,
      }))
    )}`,
  ].join('\n\n');
}

async function readProgress() {
  try {
    const source = await readFile(PROGRESS_PATH, 'utf8');
    const entries = z.array(GeneratedAnswerDto).parse(JSON.parse(source));
    return new Map(entries.map((entry) => [entry.id, entry]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw error;
  }
}

async function saveProgress(
  progress: Map<string, z.infer<typeof GeneratedAnswerDto>>
) {
  await writeFile(
    PROGRESS_PATH,
    `${JSON.stringify([...progress.values()], null, 2)}\n`,
    'utf8'
  );
}

async function generateBatch(client: OpenAI, items: CorpusItem[]) {
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
            name: 'frontend_question_answers',
            strict: true,
            schema: responseSchema,
          },
        },
        max_output_tokens: 12_000,
      });
      const parsed = GeneratedBatchDto.parse(JSON.parse(response.output_text));
      const expectedIds = new Set(items.map((item) => item.id));
      const actualIds = new Set(parsed.items.map((item) => item.id));
      if (
        expectedIds.size !== actualIds.size ||
        [...expectedIds].some((id) => !actualIds.has(id))
      ) {
        throw new Error('Модель вернула неполный набор ответов');
      }
      return parsed.items.map((item) => ({
        ...item,
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
  const progress = await readProgress();
  const pending = items.filter((item) => !progress.has(item.id));
  const batches = Array.from(
    { length: Math.ceil(pending.length / BATCH_SIZE) },
    (_, index) => pending.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE)
  );
  const client = new OpenAI({ apiKey });

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, batches.length) },
    async () => {
      while (cursor < batches.length) {
        const batchIndex = cursor;
        cursor += 1;
        const batch = batches[batchIndex];
        if (!batch) return;
        const generated = await generateBatch(client, batch);
        for (const answer of generated) progress.set(answer.id, answer);
        await saveProgress(progress);
        console.log(
          `Проверено ответов: ${progress.size}/${items.length} (пакет ${batchIndex + 1}/${batches.length})`
        );
      }
    }
  );
  await Promise.all(workers);

  const verifiedAt = new Date().toISOString();
  const completed = items.map((item) => {
    const generated = progress.get(item.id);
    if (!generated) throw new Error(`Нет ответа для ${item.id}`);
    return {
      ...item,
      answer: sanitizeAnswer(generated.answer),
      answerFormat: 'markdown' as const,
      technicalReview: 'passed' as const,
      provenance: {
        ...item.provenance,
        answerSources: generated.sources,
        answerVerifiedAt: verifiedAt,
        changesSummary: [
          item.provenance.changesSummary,
          `Добавлен краткий ответ, проверенный по первичным источникам моделью ${MODEL}.`,
        ]
          .filter(Boolean)
          .join(' '),
      },
    };
  });

  await writeFile(
    CORPUS_PATH,
    `${completed.map((item) => JSON.stringify(item)).join('\n')}\n`,
    'utf8'
  );
  console.log(`Корпус обновлён: ${completed.length} ответов.`);
}

main().catch((error) => {
  console.error('Не удалось подготовить ответы:', error);
  process.exitCode = 1;
});
