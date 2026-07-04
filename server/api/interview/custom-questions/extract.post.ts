import { QuestionInputExtractResponseDto } from '@/shared/dto';
import { recordAiUsageSafe } from '@/server/application/aiUsage/serviceFactory';
import { resolveOpenAiConfig } from '@/server/application/config/openaiConfig';
import { extractInterviewFileText } from '@/server/infrastructure/files/extractInterviewFileText';
import {
  extractTextFromImageWithOpenAi,
  resolveImageExtractionModel,
} from '@/server/infrastructure/llm/openaiImageTextExtractor';
import { OpenAiInterviewEngine } from '@/server/infrastructure/llm/openaiInterviewEngine';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const session = event.context.session;
  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.name === 'file' && part.data);

  if (!file?.data) {
    throw apiError('E_VALIDATION', 'Прикрепите PDF, изображение или текстовый файл');
  }

  const runtimeConfig = useRuntimeConfig(event);
  const openai = resolveOpenAiConfig(runtimeConfig);
  const extractedText = await extractInterviewFileText({
    data: Buffer.from(file.data),
    fileName: file.filename || null,
    mimeType: file.type || null,
    maxChars: 10_000,
    imageExtractor: async (image) =>
      extractTextFromImageWithOpenAi({
        data: image.data,
        mimeType: image.mimeType,
        apiKey: openai.apiKey,
        model: resolveImageExtractionModel(),
        organization:
          process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID || null,
        project:
          process.env.NUXT_OPENAI_PROJECT_ID ||
          process.env.OPENAI_PROJECT_ID ||
          null,
        userId: session?.userId ?? null,
        anonymousSessionId: session?.id ?? null,
        instruction: [
          'Ты выполняешь OCR файла с вопросами для тренировки собеседования.',
          'Извлеки весь читаемый текст, сохрани вопросы отдельными строками.',
          'Не отвечай на вопросы и не оценивай их содержание.',
          'Верни только извлеченный текст без комментариев.',
        ].join(' '),
        detail: 'high',
      }),
  });
  const text = await normalizeQuestionFileText({
    rawText: extractedText,
    apiKey: openai.apiKey,
    model: openai.model,
    userId: session?.userId ?? null,
    anonymousSessionId: session?.id ?? null,
  });

  return QuestionInputExtractResponseDto.parse({
    text,
    fileName: file.filename || null,
    mimeType: file.type || null,
  });
});

async function normalizeQuestionFileText(params: {
  rawText: string;
  apiKey: string;
  model?: string;
  userId?: string | null;
  anonymousSessionId?: string | null;
}): Promise<string> {
  const fallback = formatQuestionList(extractQuestionCandidates(params.rawText));
  if (!params.apiKey) return fallback;

  try {
    const engine = new OpenAiInterviewEngine({
      apiKey: params.apiKey,
      model: params.model,
      organization:
        process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID || null,
      project:
        process.env.NUXT_OPENAI_PROJECT_ID ||
        process.env.OPENAI_PROJECT_ID ||
        null,
      recordUsage: recordAiUsageSafe,
    });
    const normalized = await engine.normalizeCustomQuestions({
      rawText: params.rawText,
      anonymousSessionId: params.anonymousSessionId || 'anonymous',
      userId: params.userId ?? null,
    });
    const questions = extractQuestionCandidates(normalized.questions.join('\n'));
    return formatQuestionList(questions.length ? questions : extractQuestionCandidates(params.rawText));
  } catch {
    return fallback;
  }
}

function extractQuestionCandidates(value: string): string[] {
  const chunks = value
    .replace(/\r\n?/g, '\n')
    .split(/\n|;|(?<=\?)\s+/)
    .map((item) =>
      item
        .trim()
        .replace(/^\s*(?:[-*•]|\d+[).:-])\s*/, '')
        .replace(/\s+/g, ' ')
    )
    .filter((item) => item.length >= 8);
  const seen = new Set<string>();
  const questions: string[] = [];
  for (const chunk of chunks) {
    const question = /[?.!]$/.test(chunk) ? chunk : `${chunk}?`;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(question);
  }
  return questions.slice(0, 30);
}

function formatQuestionList(questions: string[]): string {
  const safeQuestions = questions.length
    ? questions
    : ['Не удалось выделить вопросы из файла. Добавьте их вручную.'];
  return safeQuestions
    .map((question, index) => `${index + 1}. ${question}`)
    .join('\n');
}
