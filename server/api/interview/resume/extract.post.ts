import { ResumeExtractResponseDto } from '@/shared/dto';
import { extractResumeText } from '@/server/infrastructure/resume/extractResumeText';
import { apiError } from '@/server/utils/errors';
import { defineApiHandler } from '@/server/utils/handler';

export default defineApiHandler(async (event) => {
  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.name === 'file' && part.data);

  if (!file?.data) {
    throw apiError('E_VALIDATION', 'Прикрепите PDF или текстовый файл резюме');
  }

  const text = await extractResumeText({
    data: Buffer.from(file.data),
    fileName: file.filename || null,
    mimeType: file.type || null,
  });

  return ResumeExtractResponseDto.parse({
    text,
    fileName: file.filename || null,
    mimeType: file.type || null,
  });
});
