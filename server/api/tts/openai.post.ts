import { $fetch } from 'ofetch';
import { TtsRequestDto } from '@/shared/dto';
import { resolveOpenAiConfig } from '@/server/application/config/openaiConfig';
import { resolveTtsConfig } from '@/server/application/tts/ttsConfig';
import { apiError } from '@/server/utils/errors';
import { assertDirectOpenAiAccessAllowed } from '@/server/infrastructure/llm/openaiResponsesClient';
import { defineApiHandler } from '@/server/utils/handler';
import { requireAuthenticatedSession } from '@/server/utils/session';
import { readDto } from '@/server/utils/validate';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

export default defineApiHandler(async (event) => {
  // Озвучка идёт через платный OpenAI TTS — анонимный доступ закрыт.
  requireAuthenticatedSession(event);

  const runtimeConfig = useRuntimeConfig(event);
  const ttsConfig = resolveTtsConfig(runtimeConfig);
  if (!ttsConfig.enabled) {
    throw apiError('E_FORBIDDEN', 'Озвучка вопросов временно выключена');
  }

  const { apiKey } = resolveOpenAiConfig(runtimeConfig);
  if (!apiKey) {
    throw apiError('E_UPSTREAM', 'Провайдер озвучки не настроен');
  }

  const input = await readDto(event, TtsRequestDto);
  // При включённом relay запрещаем незаметный обход через прямой api.openai.com.
  assertDirectOpenAiAccessAllowed();
  const format = input.format || 'mp3';

  try {
    const response = await $fetch.raw(OPENAI_TTS_URL, {
      method: 'POST',
      responseType: 'arrayBuffer',
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: input.model || ttsConfig.model,
        voice: input.voice || ttsConfig.voice,
        input: input.text,
        response_format: format,
      },
    });

    const mimeType =
      format === 'wav' ? 'audio/wav' : format === 'opus' ? 'audio/ogg' : 'audio/mpeg';
    setResponseHeader(event, 'Content-Type', mimeType);
    return new Uint8Array(response._data as ArrayBuffer);
  } catch (error: any) {
    throw apiError('E_UPSTREAM', 'Не удалось озвучить вопрос', {
      cause: error?.data?.error?.message || error?.message || String(error),
    });
  }
});
