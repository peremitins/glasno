import {
  InterviewStateResponseDto,
  ReplyInterviewTurnRequestDto,
} from '@/shared/dto';
import { createInterviewService } from '@/server/application/interview/serviceFactory';
import { isApiError } from '@/server/utils/errors';
import { logger } from '@/server/utils/logger';

// SSE-стрим ответа интервьюера: текст приходит фрагментами (output_text_delta),
// затем финальное состояние интервью (done + state). Формат чанков — см.
// InterviewReplyStreamChunkDto. Без перехода к следующему вопросу.
export default defineEventHandler(async (event) => {
  setHeader(event, 'Content-Type', 'text/event-stream; charset=utf-8');
  setHeader(event, 'Cache-Control', 'no-cache, no-transform');
  setHeader(event, 'Connection', 'keep-alive');
  // Отключаем буферизацию прокси (nginx), чтобы дельты шли сразу.
  setHeader(event, 'X-Accel-Buffering', 'no');

  const res = event.node.res;
  // Открываем поток сразу и отключаем буферизацию/алгоритм Нэйгла, чтобы
  // каждая дельта уходила клиенту немедленно, а не копилась до конца ответа.
  res.flushHeaders?.();
  res.socket?.setNoDelay?.(true);
  const write = (chunk: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    // Если на пути есть compression middleware — проталкиваем буфер.
    (res as unknown as { flush?: () => void }).flush?.();
  };
  // Стартовый комментарий SSE: мгновенно «открывает» соединение для клиента.
  res.write(': open\n\n');
  const writeError = (code: string, message: string) => {
    write({ error: { code, message } });
  };

  try {
    const session = event.context.session;
    if (!session) {
      writeError('E_AUTH', 'Сессия не инициализирована');
      return;
    }

    const id = getRouterParam(event, 'id');
    if (!id) {
      writeError('E_VALIDATION', 'Не указан id интервью');
      return;
    }

    const parsed = ReplyInterviewTurnRequestDto.safeParse(await readBody(event));
    if (!parsed.success) {
      writeError('E_VALIDATION', 'Ошибка валидации данных');
      return;
    }

    const service = createInterviewService(event);
    const stream = service.replyTurnStream({
      anonymousSessionId: session.id,
      userId: session.userId ?? null,
      sessionId: id,
      input: parsed.data,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'delta') {
        write({ output_text_delta: chunk.text });
      } else {
        write({ done: true, state: InterviewStateResponseDto.parse(chunk.state) });
      }
    }
  } catch (err) {
    if (isApiError(err)) {
      writeError(err.data.code, err.data.message);
    } else {
      logger.error({ err, requestId: event.context.requestId }, 'Interview reply stream error');
      writeError('E_UNKNOWN', 'Внутренняя ошибка сервера');
    }
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});
