import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { z } from 'zod';

config({ path: '.env.development' });
config();

const CORPUS_PATH = resolve(
  process.cwd(),
  'data/question-bank/frontend-v1.jsonl'
);
const REPORT_PATH = resolve(
  process.cwd(),
  'reports/question-bank/frontend-v1-deduplication.md'
);
const PROGRESS_PATH = resolve('/tmp/jobai-question-bank-deduplication.json');
const MODEL = process.env.QUESTION_BANK_DEDUP_MODEL ?? 'gpt-5.4-mini';

const DuplicateGroupDto = z.object({
  canonicalId: z.string().min(1),
  duplicateIds: z.array(z.string().min(1)).min(1),
  reason: z.string().min(10),
});
const ModelDuplicateGroupDto = z.object({
  canonicalRef: z.number().int().nonnegative(),
  duplicateRefs: z.array(z.number().int().nonnegative()).min(1),
  reason: z.string().min(10),
});
const AuditResponseDto = z.object({
  duplicateGroups: z.array(ModelDuplicateGroupDto),
});

interface CorpusItem {
  id: string;
  slug: string;
  framework: string;
  topic: string;
  subtopic: string | null;
  interviewType: string;
  seniority: string;
  difficulty: number;
  question: string;
  variants: string[];
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
  required: ['duplicateGroups'],
  properties: {
    duplicateGroups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['canonicalRef', 'duplicateRefs', 'reason'],
        properties: {
          canonicalRef: { type: 'integer', minimum: 0 },
          duplicateRefs: {
            type: 'array',
            minItems: 1,
            items: { type: 'integer', minimum: 0 },
          },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueText(items: string[], excluded: string) {
  const excludedKey = normalizeText(excluded);
  const unique = new Map<string, string>();
  for (const item of items) {
    const value = item.trim();
    const key = normalizeText(value);
    if (!key || key === excludedKey || unique.has(key)) continue;
    unique.set(key, value);
  }
  return [...unique.values()];
}

function uniqueStrings(items: string[]) {
  return [...new Map(items.map((item) => [normalizeText(item), item.trim()])).values()]
    .filter(Boolean);
}

export function mergeDuplicateGroup(
  canonical: CorpusItem,
  duplicates: CorpusItem[]
): CorpusItem {
  const duplicateIds = duplicates.map((item) => item.id);
  return {
    ...canonical,
    variants: uniqueText(
      [
        ...canonical.variants,
        ...duplicates.flatMap((item) => [item.question, ...item.variants]),
      ],
      canonical.question
    ),
    tags: uniqueStrings([
      ...canonical.tags,
      ...duplicates.flatMap((item) => item.tags),
    ]),
    expectedConcepts: uniqueStrings([
      ...canonical.expectedConcepts,
      ...duplicates.flatMap((item) => item.expectedConcepts),
    ]),
    provenance: {
      ...canonical.provenance,
      changesSummary: [
        canonical.provenance.changesSummary,
        `Смысловые дубли перенесены в variants: ${duplicateIds.join(', ')}`,
      ]
        .filter(Boolean)
        .join('; '),
    },
  };
}

function auditPrompt(items: CorpusItem[]) {
  return [
    'Ты проводишь строгую редакторскую дедупликацию русскоязычного банка вопросов для frontend-интервью.',
    'Все вопросы в пакете относятся к одному фреймворку и одному грейду. Найди только смысловые дубли: вопросы, для которых сильный кандидат дал бы по существу один и тот же ответ с той же глубиной. Связанные темы и разные аспекты одной технологии не объединяй.',
    'У одного концепта должна остаться одна каноническая запись на грейд. Например, несколько общих вопросов о различиях unit, integration и E2E тестов на Junior — один концепт. Вопрос о выборе test doubles или борьбе с flaky E2E — уже другой концепт.',
    'Выбирай canonicalId по ясности и естественности формулировки. Предпочитай короткую прямую фразу без канцелярита, кальки, рекламного тона, искусственного перечисления и одинакового ритма. Не создавай новый текст: альтернативные формулировки будут перенесены в variants автоматически.',
    'Не объединяй вопросы только потому, что у них совпадает общий тег. Если сомневаешься, оставь их раздельно. reason напиши кратко и по-русски, без вводных фраз и шаблонной похвалы.',
    'Используй только числовые ref из входных данных. Каждый duplicateRef может встретиться только один раз. canonicalRef не включай в duplicateRefs. Если дублей нет, верни пустой массив.',
    `Вопросы: ${JSON.stringify(
      items.map((item, ref) => ({
        ref,
        id: item.id,
        topic: item.topic,
        subtopic: item.subtopic,
        interviewType: item.interviewType,
        difficulty: item.difficulty,
        question: item.question,
        expectedConcepts: item.expectedConcepts,
        tags: item.tags,
      }))
    )}`,
  ].join('\n\n');
}

async function auditGroup(client: OpenAI, items: CorpusItem[]) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await client.responses.create({
        model: MODEL,
        reasoning: { effort: 'medium' },
        input: auditPrompt(items),
        text: {
          format: {
            type: 'json_schema',
            name: 'frontend_question_duplicate_audit',
            strict: true,
            schema: responseSchema,
          },
        },
        max_output_tokens: 12_000,
      });
      const parsed = AuditResponseDto.parse(JSON.parse(response.output_text));
      const mapped = parsed.duplicateGroups.map((group) => {
        const canonical = items[group.canonicalRef];
        const duplicates = group.duplicateRefs.map((ref) => items[ref]);
        if (!canonical || duplicates.some((item) => !item)) {
          throw new Error('Калибровщик вернул неизвестный ref');
        }
        return {
          canonicalId: canonical.id,
          duplicateIds: duplicates.map((item) => item.id),
          reason: group.reason,
        };
      });
      validateGroups(mapped, items);
      return { duplicateGroups: mapped };
    } catch (error) {
      lastError = error;
      if (attempt < 5) {
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, attempt * 2_000)
        );
        continue;
      }
    }
  }
  throw lastError;
}

function validateGroups(
  groups: z.infer<typeof DuplicateGroupDto>[],
  items: CorpusItem[]
) {
  const available = new Set(items.map((item) => item.id));
  const consumed = new Set<string>();
  for (const group of groups) {
    if (!available.has(group.canonicalId)) {
      throw new Error(`Неизвестный canonicalId: ${group.canonicalId}`);
    }
    for (const duplicateId of group.duplicateIds) {
      if (!available.has(duplicateId)) {
        throw new Error(`Неизвестный duplicateId: ${duplicateId}`);
      }
      if (duplicateId === group.canonicalId || consumed.has(duplicateId)) {
        throw new Error(`Повторное использование duplicateId: ${duplicateId}`);
      }
      consumed.add(duplicateId);
    }
  }
}

async function main() {
  const apiKey = process.env.NUXT_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Не задан NUXT_OPENAI_API_KEY');

  const source = await readFile(CORPUS_PATH, 'utf8');
  const corpusHash = createHash('sha256').update(source).digest('hex');
  const items = source
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as CorpusItem);
  const grouped = new Map<string, CorpusItem[]>();
  for (const item of items) {
    const key =
      item.framework === 'none' && item.seniority === 'middle'
        ? `${item.framework}/${item.seniority}/${item.topic}`
        : `${item.framework}/${item.seniority}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  const client = new OpenAI({ apiKey });
  const auditEntries: Array<{
    scope: string;
    group: z.infer<typeof DuplicateGroupDto>;
  }> = await readProgress(corpusHash);
  const completedScopes = new Set(auditEntries.map((entry) => entry.scope));
  const scopes = [...grouped.entries()].filter(
    ([scope]) => !completedScopes.has(scope)
  );
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(2, scopes.length) },
    async () => {
      while (cursor < scopes.length) {
        const index = cursor;
        cursor += 1;
        const entry = scopes[index];
        if (!entry) return;
        const [scope, groupItems] = entry;
        const response = await auditGroup(client, groupItems);
        auditEntries.push(
          ...response.duplicateGroups.map((group) => ({ scope, group }))
        );
        await writeFile(
          PROGRESS_PATH,
          `${JSON.stringify({ corpusHash, auditEntries }, null, 2)}\n`,
          'utf8'
        );
        console.log(
          `${scope}: найдено групп ${response.duplicateGroups.length}, дублей ${response.duplicateGroups.reduce((sum, group) => sum + group.duplicateIds.length, 0)}`
        );
      }
    }
  );
  await Promise.all(workers);

  const byId = new Map(items.map((item) => [item.id, item]));
  const removed = new Set(
    auditEntries.flatMap((entry) => entry.group.duplicateIds)
  );
  const mergedByCanonical = new Map<string, CorpusItem>();
  for (const entry of auditEntries) {
    const canonical = mergedByCanonical.get(entry.group.canonicalId) ??
      byId.get(entry.group.canonicalId);
    if (!canonical) throw new Error(`Не найден ${entry.group.canonicalId}`);
    const duplicates = entry.group.duplicateIds.map((id) => {
      const item = byId.get(id);
      if (!item) throw new Error(`Не найден ${id}`);
      return item;
    });
    mergedByCanonical.set(
      entry.group.canonicalId,
      mergeDuplicateGroup(canonical, duplicates)
    );
  }

  const completed = items
    .filter((item) => !removed.has(item.id))
    .map((item) => mergedByCanonical.get(item.id) ?? item)
    .sort((left, right) =>
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

  const report = [
    '# Аудит смысловых дублей frontend-v1',
    '',
    `Исходных записей: ${items.length}.`,
    `Удалено смысловых дублей: ${removed.size}.`,
    `Осталось канонических вопросов: ${completed.length}.`,
    '',
    ...auditEntries.flatMap(({ scope, group }) => [
      `## ${group.canonicalId}`,
      '',
      `Контекст: ${scope}.`,
      `Удалены: ${group.duplicateIds.join(', ')}.`,
      `Причина: ${group.reason}`,
      '',
    ]),
  ].join('\n');
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${report.trim()}\n`, 'utf8');

  console.log(`Удалено дублей: ${removed.size}`);
  console.log(`Канонических вопросов: ${completed.length}`);
  console.log(`Отчёт: ${REPORT_PATH}`);
}

async function readProgress(corpusHash: string) {
  try {
    const raw = JSON.parse(await readFile(PROGRESS_PATH, 'utf8')) as {
      corpusHash?: unknown;
      auditEntries?: unknown;
    };
    if (raw.corpusHash !== corpusHash || !Array.isArray(raw.auditEntries)) {
      return [];
    }
    return z
      .array(z.object({ scope: z.string(), group: DuplicateGroupDto }))
      .parse(raw.auditEntries);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Не удалось провести дедупликацию:', error);
    process.exit(1);
  });
}
