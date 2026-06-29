import { QuestionInputExtractResponseDto } from '@/shared/dto';
import { resolveOpenAiConfig } from '@/server/application/config/openaiConfig';
import { extractInterviewFileText } from '@/server/infrastructure/files/extractInterviewFileText';
import { extractTextFromImageWithOpenAi } from '@/server/infrastructure/llm/openaiImageTextExtractor';
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
  const text = await extractInterviewFileText({
    data: Buffer.from(file.data),
    fileName: file.filename || null,
    mimeType: file.type || null,
    maxChars: 10_000,
    imageExtractor: async (image) =>
      extractTextFromImageWithOpenAi({
        data: image.data,
        mimeType: image.mimeType,
        apiKey: openai.apiKey,
        model: openai.model,
        organization:
          process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID || null,
        project:
          process.env.NUXT_OPENAI_PROJECT_ID ||
          process.env.OPENAI_PROJECT_ID ||
          null,
        userId: session?.userId ?? null,
        anonymousSessionId: session?.id ?? null,
      }),
  });

  return QuestionInputExtractResponseDto.parse({
    text,
    fileName: file.filename || null,
    mimeType: file.type || null,
  });
});
