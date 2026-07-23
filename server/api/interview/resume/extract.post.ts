import { ResumeExtractResponseDto } from '@/shared/dto';
import { resolveOpenAiConfig } from '@/server/application/config/openaiConfig';
import { extractResumeText } from '@/server/infrastructure/resume/extractResumeText';
import {
  extractTextFromImageWithOpenAi,
  resolveImageExtractionModel,
} from '@/server/infrastructure/llm/openaiImageTextExtractor';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';
import { requireAuthenticatedSession } from '@/server/utils/session';

export default defineApiHandler(async (event) => {
  const session = requireAuthenticatedSession(event);
  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.name === 'file' && part.data);

  if (!file?.data) {
    throw apiError(
      'E_VALIDATION',
      'Прикрепите PDF, изображение или текстовый файл резюме'
    );
  }

  const runtimeConfig = useRuntimeConfig(event);
  const openai = resolveOpenAiConfig(runtimeConfig);
  const text = await extractResumeText({
    data: Buffer.from(file.data),
    fileName: file.filename || null,
    mimeType: file.type || null,
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
        usageKind: 'resume_extract',
        instruction: [
          'Извлеки читаемый текст резюме с изображения.',
          'Сохрани секции, должности, даты, компании, навыки и достижения отдельными строками.',
          'Верни только текст без комментариев.',
        ].join(' '),
      }),
  });

  return ResumeExtractResponseDto.parse({
    text,
    fileName: file.filename || null,
    mimeType: file.type || null,
  });
});
