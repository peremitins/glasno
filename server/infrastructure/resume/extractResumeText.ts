import {
  extractInterviewFileText,
  type ExtractInterviewFileTextParams,
} from '@/server/infrastructure/files/extractInterviewFileText';

const MAX_RESUME_BYTES = 6 * 1024 * 1024;
const MAX_RESUME_CHARS = 30_000;

export async function extractResumeText(
  params: Pick<
    ExtractInterviewFileTextParams,
    'data' | 'fileName' | 'mimeType' | 'imageExtractor'
  >
): Promise<string> {
  return extractInterviewFileText({
    ...params,
    maxBytes: MAX_RESUME_BYTES,
    maxChars: MAX_RESUME_CHARS,
  });
}
