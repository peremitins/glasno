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
const PROGRESS_PATH = resolve('/tmp/jobai-question-bank-seniority.json');
const MODEL = process.env.QUESTION_BANK_SENIORITY_MODEL ?? 'gpt-5.4-mini';
const BATCH_SIZE = 20;
const CONCURRENCY = Number(process.env.QUESTION_BANK_SENIORITY_CONCURRENCY ?? 6);
const ADVANCED_JUNIOR_PATTERN =
  /CI\/CD|performance budgets?|RUM|синтетическ(?:ий|ое) мониторинг|наблюдаемост|инцидент|стратеги[ия] релиза|откат|микрофронтенд|monorepo|монорепозитор|Module Federation|hydration mismatch|несоответстви[ея] гидратации|heap snapshot|профилировани[ея] памяти|CSP|OAuth|threat model|модель угроз|WeakMap|WeakSet|Function\.prototype\.toString|passive event listener|SameSite|MutationObserver|алгоритм reconciliation/i;

const AssessmentDto = z.object({
  id: z.string().min(1),
  seniority: z.enum(['junior', 'middle', 'senior']),
  difficulty: z.number().int().min(1).max(5),
  rationale: z.string().min(10),
});
const AssessmentBatchDto = z.object({ items: z.array(AssessmentDto) });

interface CorpusItem {
  id: string;
  framework: string;
  topic: string;
  subtopic: string | null;
  interviewType: string;
  seniority: 'junior' | 'middle' | 'senior';
  difficulty: number;
  question: string;
  tags: string[];
  expectedConcepts: string[];
  provenance: {
    changesSummary: string | null;
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
        required: ['id', 'seniority', 'difficulty', 'rationale'],
        properties: {
          id: { type: 'string' },
          seniority: {
            type: 'string',
            enum: ['junior', 'middle', 'senior'],
          },
          difficulty: { type: 'integer', minimum: 1, maximum: 5 },
          rationale: { type: 'string' },
        },
      },
    },
  },
} as const;

function promptFor(items: CorpusItem[], juniorAudit: boolean) {
  const rubric = [
    'Junior: проверяет фундамент и применение одного базового понятия в типовой ситуации. Не требует production-опыта, архитектурных компромиссов, проектирования процессов, продвинутой диагностики или знания внутренних механизмов. Сложность только 1–2.',
    'Middle: требует уверенного практического применения нескольких связанных понятий, отладки, тестирования, роутинга/состояния, базовой производительности или безопасности. Знание назначения CI/CD допустимо, но проектирование пайплайна, quality gates и стратегий релиза — не Junior. Сложность 2–4.',
    'Senior: требует проектирования систем и процессов, оценки компромиссов и рисков, масштабирования, глубокой безопасности/производительности, SSR/hydration internals, observability, архитектуры CI/CD, релизов, монорепозитория или расследования сложных production-инцидентов. Сложность 4–5.',
    'System design не относится к Junior. Поведенческий вопрос оценивай по требуемому масштабу ответственности, а live coding — по сложности решения и необходимым граничным случаям.',
    'Не соблюдай никакие квоты и не пытайся сохранить прежнее распределение. Оценивай именно минимальную устойчивую компетенцию, необходимую для полного сильного ответа на формулировку.',
  ];

  return [
    juniorAudit
      ? 'Ты финальный калибровщик frontend-интервью. Повторно и консервативно проверь вопросы, которые предварительно признаны Junior. Если сильный полный ответ обычно требует коммерческого production-опыта или знания уровня Middle/Senior, обязательно повысь уровень.'
      : 'Ты независимый калибровщик frontend-интервью. Заново определи грейд и сложность каждого вопроса. Предыдущие значения могли быть ошибочно подогнаны под квоту — не используй их как ориентир.',
    ...rubric,
    'В rationale коротко укажи, какая минимальная компетенция определяет выбранный уровень. Верни каждый переданный id ровно один раз.',
    `Вопросы: ${JSON.stringify(
      items.map((item) => ({
        id: item.id,
        framework: item.framework,
        topic: item.topic,
        subtopic: item.subtopic,
        interviewType: item.interviewType,
        question: item.question,
        tags: item.tags,
        expectedConcepts: item.expectedConcepts,
      }))
    )}`,
  ].join('\n\n');
}

async function assessBatch(
  client: OpenAI,
  items: CorpusItem[],
  juniorAudit: boolean
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await client.responses.create({
        model: MODEL,
        reasoning: { effort: 'medium' },
        input: promptFor(items, juniorAudit),
        text: {
          format: {
            type: 'json_schema',
            name: juniorAudit
              ? 'frontend_junior_seniority_audit'
              : 'frontend_seniority_assessment',
            strict: true,
            schema: responseSchema,
          },
        },
        max_output_tokens: 8_000,
      });
      const parsed = AssessmentBatchDto.parse(JSON.parse(response.output_text));
      const expectedIds = new Set(items.map((item) => item.id));
      const actualIds = new Set(parsed.items.map((item) => item.id));
      if (
        expectedIds.size !== actualIds.size ||
        [...expectedIds].some((id) => !actualIds.has(id))
      ) {
        throw new Error('Калибровщик вернул неполный набор вопросов');
      }
      return parsed.items;
    } catch (error) {
      lastError = error;
      if (attempt < 3) continue;
    }
  }
  throw lastError;
}

async function assessAll(
  client: OpenAI,
  items: CorpusItem[],
  juniorAudit: boolean
) {
  const batches = Array.from(
    { length: Math.ceil(items.length / BATCH_SIZE) },
    (_, index) => items.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE)
  );
  const result = new Map<string, z.infer<typeof AssessmentDto>>();
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, batches.length) },
    async () => {
      while (cursor < batches.length) {
        const batchIndex = cursor;
        cursor += 1;
        const batch = batches[batchIndex];
        if (!batch) return;
        const assessments = await assessBatch(client, batch, juniorAudit);
        for (const assessment of assessments) {
          result.set(assessment.id, assessment);
        }
        console.log(
          `${juniorAudit ? 'Аудит Junior' : 'Калибровка'}: ${result.size}/${items.length}`
        );
      }
    }
  );
  await Promise.all(workers);
  return result;
}

function normalizeDifficulty(
  seniority: 'junior' | 'middle' | 'senior',
  difficulty: number
) {
  if (seniority === 'junior') return Math.min(2, difficulty);
  if (seniority === 'middle') return Math.min(4, Math.max(2, difficulty));
  return Math.max(4, difficulty);
}

function applyJuniorGuardrails(
  assessment: z.infer<typeof AssessmentDto>,
  item: CorpusItem
) {
  if (
    assessment.seniority === 'junior' &&
    (item.interviewType === 'system_design' ||
      ADVANCED_JUNIOR_PATTERN.test(item.question))
  ) {
    return {
      ...assessment,
      seniority: 'middle' as const,
      difficulty: Math.max(3, assessment.difficulty),
      rationale: `Минимум Middle: ${assessment.rationale}`,
    };
  }
  return assessment;
}

async function main() {
  const apiKey = process.env.NUXT_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Не задан NUXT_OPENAI_API_KEY');

  const source = await readFile(CORPUS_PATH, 'utf8');
  const items = source
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as CorpusItem);
  const client = new OpenAI({ apiKey });

  const initial = await assessAll(client, items, false);
  const initiallyClassified = items.map((item) => ({
    ...item,
    ...initial.get(item.id),
  })) as CorpusItem[];
  const juniorCandidates = initiallyClassified.filter(
    (item) => item.seniority === 'junior'
  );
  const juniorAudit = await assessAll(client, juniorCandidates, true);
  const finalAssessments = new Map(initial);
  for (const [id, assessment] of juniorAudit) {
    finalAssessments.set(id, assessment);
  }

  await writeFile(
    PROGRESS_PATH,
    `${JSON.stringify([...finalAssessments.values()], null, 2)}\n`,
    'utf8'
  );

  let changed = 0;
  const completed = items.map((item) => {
    const rawAssessment = finalAssessments.get(item.id);
    if (!rawAssessment) throw new Error(`Нет оценки для ${item.id}`);
    const assessment = applyJuniorGuardrails(rawAssessment, item);
    const difficulty = normalizeDifficulty(
      assessment.seniority,
      assessment.difficulty
    );
    const hasChanged =
      assessment.seniority !== item.seniority || difficulty !== item.difficulty;
    if (hasChanged) changed += 1;
    return {
      ...item,
      seniority: assessment.seniority,
      difficulty,
      provenance: {
        ...item.provenance,
        changesSummary: hasChanged
          ? [
              item.provenance.changesSummary,
              `Калибровка уровня ${item.seniority} → ${assessment.seniority}: ${assessment.rationale}`,
            ]
              .filter(Boolean)
              .join('; ')
          : item.provenance.changesSummary,
      },
    };
  });

  completed.sort((left, right) =>
    [left.framework, left.topic, left.seniority, left.id]
      .join('|')
      .localeCompare(
        [right.framework, right.topic, right.seniority, right.id].join('|')
      )
  );
  await writeFile(
    CORPUS_PATH,
    `${completed.map((item) => JSON.stringify(item)).join('\n')}\n`,
    'utf8'
  );

  const distribution = Object.fromEntries(
    ['junior', 'middle', 'senior'].map((seniority) => [
      seniority,
      completed.filter((item) => item.seniority === seniority).length,
    ])
  );
  console.log(`Изменено оценок: ${changed}`);
  console.log(`Новое распределение: ${JSON.stringify(distribution)}`);
}

main().catch((error) => {
  console.error('Не удалось перекалибровать уровни:', error);
  process.exit(1);
});
