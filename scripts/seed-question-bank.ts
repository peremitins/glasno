import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';
import { and, like, notInArray } from 'drizzle-orm';
import { getDb, schema } from '../server/infrastructure/db/client';
import { QuestionBankProvenanceDto } from '../shared/dto/questionBank';

config({ path: '.env.development' });
config();

const CorpusItemDto = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  framework: z.enum(['none', 'react', 'vue', 'angular']),
  topic: z.string().min(1),
  subtopic: z.string().nullable(),
  interviewType: z.enum([
    'technical',
    'behavioral',
    'live_coding',
    'system_design',
  ]),
  seniority: z.enum(['junior', 'middle', 'senior']),
  difficulty: z.number().int().min(1).max(5),
  question: z.string().min(20),
  variants: z.array(z.string()),
  answer: z.string().nullable(),
  answerFormat: z.enum(['plain', 'markdown']).nullable(),
  tags: z.array(z.string()),
  expectedConcepts: z.array(z.string()),
  status: z.enum(['review', 'published', 'deprecated']),
  technicalReview: z.enum(['pending', 'passed', 'rejected']),
  editorialReview: z.enum(['pending', 'passed', 'rejected']),
  provenance: QuestionBankProvenanceDto,
}).superRefine((item, context) => {
  if (item.answer && item.provenance.answerSources.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['provenance', 'answerSources'],
      message: 'Для ответа нужен хотя бы один проверяемый источник',
    });
  }
});

type CorpusItem = z.infer<typeof CorpusItemDto>;

function legacyType(item: CorpusItem) {
  if (item.interviewType === 'behavioral') return 'behavioral';
  return 'professional';
}

function toDatabaseRecord(item: CorpusItem) {
  return {
    corpusId: item.id,
    slug: item.slug,
    domain: 'engineering',
    role: 'Frontend Developer',
    type: legacyType(item),
    difficulty: item.seniority,
    framework: item.framework,
    topic: item.topic,
    subtopic: item.subtopic,
    interviewType: item.interviewType,
    seniority: item.seniority,
    difficultyLevel: item.difficulty,
    question: item.question,
    variants: item.variants,
    strongAnswer: item.answer,
    answerFormat: item.answerFormat,
    tags: item.tags,
    expectedConcepts: item.expectedConcepts,
    status: item.status,
    technicalReview: item.technicalReview,
    editorialReview: item.editorialReview,
    provenance: item.provenance,
    isPublic: false,
    updatedAt: new Date(),
  };
}

async function main() {
  const corpusPath = resolve(
    process.cwd(),
    'data/question-bank/frontend-v1.jsonl'
  );
  const source = await readFile(corpusPath, 'utf8');
  const items = source
    .trim()
    .split('\n')
    .map((line, index) => {
      try {
        return CorpusItemDto.parse(JSON.parse(line));
      } catch (error) {
        throw new Error(`Не удалось прочитать строку ${index + 1}`, {
          cause: error,
        });
      }
    });

  if (items.length < 300) {
    throw new Error(`Корпус подозрительно мал: ${items.length} вопросов`);
  }

  const db = getDb();
  await db.transaction(async (transaction) => {
    for (let index = 0; index < items.length; index += 100) {
      const batch = items.slice(index, index + 100).map(toDatabaseRecord);
      for (const record of batch) {
        await transaction
          .insert(schema.questionBank)
          .values(record)
          .onConflictDoUpdate({
            target: schema.questionBank.corpusId,
            set: record,
          });
      }
    }
    await transaction
      .delete(schema.questionBank)
      .where(
        and(
          like(schema.questionBank.corpusId, 'frontend_%'),
          notInArray(
            schema.questionBank.corpusId,
            items.map((item) => item.id)
          )
        )
      );
  });

  console.log(`Импортировано вопросов: ${items.length}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Не удалось импортировать базу вопросов:', error);
  process.exit(1);
});
