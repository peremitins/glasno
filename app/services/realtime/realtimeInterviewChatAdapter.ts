type RealtimeServerEvent = {
  type?: string;
  [key: string]: unknown;
};

export type RealtimeInterviewChatSink = {
  createMessage: (role: 'user' | 'assistant', content: string) => string;
  appendContent: (messageId: string, delta: string) => void;
  replaceContent: (messageId: string, content: string) => void;
  removeMessage: (messageId: string) => void;
  // messageId — id соответствующего runtime-пузыря в чате. Нужен странице,
  // чтобы после сохранения реплики на сервере снять оптимистичный пузырь
  // (иначе сообщение отрисуется дважды: из состояния и из runtime).
  onUserTranscriptCompleted?: (transcript: string, messageId: string) => void;
  onAssistantTranscriptCompleted?: (
    transcript: string,
    messageId: string
  ) => void;
  // Транскрипция реплики пользователя не удалась: пузырь удалён, но
  // аудио-реплика в контексте модели есть — страница может явно запросить
  // ответ интервьюера, чтобы диалог не замер.
  onUserTranscriptFailed?: () => void;
  // Интервьюер начал/закончил говорить (realtime-аудио). Нужно для анимации
  // «говорящего» аватара: старт — на первой транскрипт-дельте ответа,
  // конец — когда озвучка реально доиграла (output_audio_buffer.stopped).
  onAssistantSpeechStarted?: () => void;
  onAssistantSpeechEnded?: () => void;
  // Кандидат начал/закончил говорить (по VAD). Нужно для амбиентной подсветки
  // нижней плитки «сейчас говорит пользователь».
  onUserSpeechStarted?: () => void;
  onUserSpeechEnded?: () => void;
};

// Метка «служебного» ответа: озвучка нового вопроса после переключения.
// Такие ответы звучат голосом, но не попадают в чат и не сохраняются в диалог —
// сам вопрос уже показан отдельным пузырём из состояния интервью.
export const REALTIME_QUESTION_ANNOUNCEMENT_KIND = 'question_announcement';

function readResponseMetadataKind(response: unknown): string {
  const metadata = (response as { metadata?: unknown } | undefined)?.metadata;
  const kind = (metadata as { glasno_kind?: unknown } | undefined)?.glasno_kind;
  return typeof kind === 'string' ? kind : '';
}

function readResponseStatus(response: unknown): string {
  const status = (response as { status?: unknown } | undefined)?.status;
  return typeof status === 'string' ? status : '';
}

function extractFinalAssistantText(response: unknown): string {
  const raw = response as {
    output?: Array<{
      role?: string;
      content?: Array<{ transcript?: unknown; text?: unknown }>;
    }>;
  };
  const chunks: string[] = [];
  for (const output of raw?.output ?? []) {
    if (output?.role !== 'assistant') continue;
    for (const part of output?.content ?? []) {
      const transcript =
        typeof part?.transcript === 'string' ? part.transcript.trim() : '';
      const text = typeof part?.text === 'string' ? part.text.trim() : '';
      const value = transcript || text;
      if (value) chunks.push(value);
    }
  }
  return chunks.join('\n').trim();
}

export class RealtimeInterviewChatAdapter {
  private readonly userMessagesByItemId = new Map<string, string>();
  private readonly userContentByItemId = new Map<string, string>();
  private readonly assistantMessagesByResponseId = new Map<string, string>();
  private readonly assistantContentByResponseId = new Map<string, string>();
  private readonly finalizedAssistantResponses = new Set<string>();
  // Ответы, по которым уже сообщили «интервьюер заговорил» (чтобы старт
  // анимации срабатывал один раз на ответ).
  private readonly speakingResponses = new Set<string>();
  // Ответы, по которым реально шло воспроизведение аудио (пришёл
  // output_audio_buffer.started). Для них конец анимации ждём именно от
  // output_audio_buffer.stopped — звук доигрывает уже ПОСЛЕ response.done.
  private readonly audioBufferedResponses = new Set<string>();
  // Служебные ответы-озвучки нового вопроса: звучат, но не пишутся в чат.
  private readonly announcementResponses = new Set<string>();
  // Готовые транскрипты, ожидающие подтверждения в response.done: сохранение
  // в диалог выполняем только для завершённых (не отменённых) ответов, иначе
  // оборванный «спор» модели с командой «следующий вопрос» попадёт в историю.
  private readonly pendingTranscriptsByResponseId = new Map<
    string,
    { text: string; messageId: string }
  >();

  constructor(private readonly sink: RealtimeInterviewChatSink) {}

  handleServerEvent(event: RealtimeServerEvent) {
    if (typeof event.type !== 'string') return;

    switch (event.type) {
      case 'conversation.item.created': {
        const item = event.item as { id?: unknown; role?: unknown } | undefined;
        const itemId = typeof item?.id === 'string' ? item.id : '';
        const role = typeof item?.role === 'string' ? item.role : '';
        if (itemId && role === 'user') this.ensureUserMessage(itemId);
        return;
      }

      case 'input_audio_buffer.speech_started': {
        const itemId = stringValue(event.item_id);
        if (itemId) this.ensureUserMessage(itemId);
        this.sink.onUserSpeechStarted?.();
        return;
      }

      case 'input_audio_buffer.speech_stopped': {
        this.sink.onUserSpeechEnded?.();
        return;
      }

      case 'conversation.item.input_audio_transcription.delta': {
        const itemId = stringValue(event.item_id);
        const delta = stringValue(event.delta);
        if (itemId && delta) this.appendUserContent(itemId, delta);
        return;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const itemId = stringValue(event.item_id);
        const transcript = stringValue(event.transcript).trim();
        // Реплика распознана — кандидат точно закончил говорить: гасим подсветку.
        this.sink.onUserSpeechEnded?.();
        if (!itemId) return;
        if (transcript) {
          const messageId = this.ensureUserMessage(itemId);
          this.replaceUserContent(itemId, transcript);
          this.sink.onUserTranscriptCompleted?.(transcript, messageId);
          return;
        }
        if (!this.userContentByItemId.get(itemId)?.trim()) {
          this.removeUserMessage(itemId);
        }
        this.sink.onUserTranscriptFailed?.();
        return;
      }

      case 'conversation.item.input_audio_transcription.failed': {
        const itemId = stringValue(event.item_id);
        if (itemId) this.removeUserMessage(itemId);
        this.sink.onUserSpeechEnded?.();
        this.sink.onUserTranscriptFailed?.();
        return;
      }

      case 'response.created': {
        const responseId = stringValue(
          (event.response as { id?: unknown } | undefined)?.id
        );
        if (!responseId) return;
        if (
          readResponseMetadataKind(event.response) ===
          REALTIME_QUESTION_ANNOUNCEMENT_KIND
        ) {
          this.announcementResponses.add(responseId);
        }
        this.startAssistantSpeech(responseId);
        return;
      }

      case 'output_audio_buffer.started': {
        const responseId = stringValue(event.response_id);
        if (responseId) {
          this.audioBufferedResponses.add(responseId);
          this.startAssistantSpeech(responseId);
        }
        return;
      }

      case 'output_audio_buffer.stopped': {
        // Голос ассистента реально доиграл — вот теперь гасим анимацию.
        const responseId = stringValue(event.response_id);
        if (responseId) {
          this.audioBufferedResponses.delete(responseId);
          this.endAssistantSpeech(responseId);
        }
        return;
      }

      case 'response.output_item.added': {
        return;
      }

      case 'response.audio_transcript.delta': {
        const responseId = stringValue(event.response_id);
        const itemId = stringValue(event.item_id);
        const delta = stringValue(event.delta);
        if (!responseId || !delta) return;
        if (this.finalizedAssistantResponses.has(responseId)) return;
        this.appendAssistantContent(responseId, itemId, delta);
        return;
      }

      case 'response.output_audio_transcript.delta': {
        const responseId = stringValue(event.response_id);
        const itemId = stringValue(event.item_id);
        const delta = stringValue(event.delta);
        if (!responseId || !delta) return;
        if (this.finalizedAssistantResponses.has(responseId)) return;
        this.appendAssistantContent(responseId, itemId, delta);
        return;
      }

      case 'response.audio_transcript.done': {
        const responseId = stringValue(event.response_id);
        if (responseId) this.finalizeAssistantResponse(responseId, stringValue(event.transcript));
        return;
      }

      case 'response.output_audio_transcript.done': {
        const responseId = stringValue(event.response_id);
        if (responseId) {
          this.finalizeAssistantResponse(responseId, stringValue(event.transcript));
        }
        return;
      }

      case 'response.done': {
        const response = event.response;
        const responseId = stringValue((response as { id?: unknown } | undefined)?.id);
        if (!responseId) {
          this.endAllAssistantSpeech();
          return;
        }
        // НЕ гасим анимацию по завершению запроса: звук ещё доигрывает.
        // Конец речи придёт из output_audio_buffer.stopped (WebRTC) или из
        // синтетического события транспорта (WebSocket). Фолбэк — только если
        // по ответу вообще не было аудио (иначе анимация зависнет).
        if (!this.audioBufferedResponses.has(responseId)) {
          this.endAssistantSpeech(responseId);
        }
        // Отменённый ответ (например, модель начала спорить с командой
        // «следующий вопрос» и была оборвана) — гасим анимацию сразу и
        // убираем недоговорённый огрызок из чата.
        if (readResponseStatus(response) === 'cancelled') {
          this.audioBufferedResponses.delete(responseId);
          this.endAssistantSpeech(responseId);
          this.discardAssistantResponse(responseId);
          return;
        }
        if (!this.finalizedAssistantResponses.has(responseId)) {
          const fallbackText = extractFinalAssistantText(response);
          if (fallbackText) {
            this.ensureAssistantMessage(responseId);
            this.finalizeAssistantResponse(responseId, fallbackText);
          }
        }
        this.notifyCompletedAssistantResponse(responseId);
        return;
      }

      default:
        return;
    }
  }

  pruneEmptyMessages() {
    for (const [itemId, messageId] of this.userMessagesByItemId.entries()) {
      if (this.userContentByItemId.get(itemId)?.trim()) continue;
      this.sink.removeMessage(messageId);
      this.userMessagesByItemId.delete(itemId);
      this.userContentByItemId.delete(itemId);
    }
  }

  private ensureUserMessage(itemId: string): string {
    const existing = this.userMessagesByItemId.get(itemId);
    if (existing) return existing;
    // Одна реплика кандидата может «прийти» под разными item_id (событие
    // speech_started, conversation.item.created и транскрипция иногда несут
    // разные идентификаторы). Чтобы это не плодило дубли пустых пузырей,
    // переиспользуем уже созданный, но ещё не заполненный пузырь пользователя.
    const reusableMessageId = this.takeReusableEmptyUserMessage();
    const messageId = reusableMessageId ?? this.sink.createMessage('user', '');
    this.userMessagesByItemId.set(itemId, messageId);
    this.userContentByItemId.set(itemId, '');
    return messageId;
  }

  // Освобождает привязку последнего пустого пузыря пользователя и возвращает его
  // messageId для переиспользования под новый item_id (см. ensureUserMessage).
  private takeReusableEmptyUserMessage(): string | null {
    for (const [itemId, messageId] of this.userMessagesByItemId.entries()) {
      if ((this.userContentByItemId.get(itemId) || '').trim()) continue;
      this.userMessagesByItemId.delete(itemId);
      this.userContentByItemId.delete(itemId);
      return messageId;
    }
    return null;
  }

  private ensureAssistantMessage(responseId: string): string {
    const existing = this.assistantMessagesByResponseId.get(responseId);
    if (existing) return existing;
    const messageId = this.sink.createMessage('assistant', '');
    this.assistantMessagesByResponseId.set(responseId, messageId);
    this.assistantContentByResponseId.set(responseId, '');
    return messageId;
  }

  private appendUserContent(itemId: string, delta: string) {
    const messageId = this.ensureUserMessage(itemId);
    const content = `${this.userContentByItemId.get(itemId) || ''}${delta}`;
    this.userContentByItemId.set(itemId, content);
    this.sink.appendContent(messageId, delta);
  }

  private replaceUserContent(itemId: string, content: string) {
    const messageId = this.ensureUserMessage(itemId);
    this.userContentByItemId.set(itemId, content);
    this.sink.replaceContent(messageId, content);
  }

  private removeUserMessage(itemId: string) {
    const messageId = this.userMessagesByItemId.get(itemId);
    if (!messageId) return;
    this.sink.removeMessage(messageId);
    this.userMessagesByItemId.delete(itemId);
    this.userContentByItemId.delete(itemId);
  }

  private appendAssistantContent(
    responseId: string,
    _itemId: string,
    delta: string
  ) {
    this.startAssistantSpeech(responseId);
    // Озвучка нового вопроса: только голос и анимация, без пузыря в чате —
    // сам вопрос уже показан отдельным сообщением из состояния интервью.
    if (this.announcementResponses.has(responseId)) return;
    const messageId = this.ensureAssistantMessage(responseId);
    const content = `${this.assistantContentByResponseId.get(responseId) || ''}${delta}`;
    this.assistantContentByResponseId.set(responseId, content);
    this.sink.appendContent(messageId, delta);
  }

  private finalizeAssistantResponse(responseId: string, finalText: string) {
    // Текст ответа готов, НО озвучка ещё идёт: анимацию здесь не снимаем —
    // её погасит output_audio_buffer.stopped, когда звук реально доиграет.
    if (this.announcementResponses.has(responseId)) {
      this.finalizedAssistantResponses.add(responseId);
      return;
    }
    const messageId = this.assistantMessagesByResponseId.get(responseId);
    if (!messageId) return;
    const normalized = finalText.trim();
    if (normalized) {
      this.assistantContentByResponseId.set(responseId, normalized);
      this.sink.replaceContent(messageId, normalized);
      // Сохранение в диалог откладываем до response.done: там видно, был ли
      // ответ отменён (отменённые не сохраняем).
      this.pendingTranscriptsByResponseId.set(responseId, {
        text: normalized,
        messageId,
      });
    }
    if (!this.assistantContentByResponseId.get(responseId)?.trim()) {
      this.sink.removeMessage(messageId);
      this.assistantMessagesByResponseId.delete(responseId);
      this.assistantContentByResponseId.delete(responseId);
    }
    this.finalizedAssistantResponses.add(responseId);
  }

  // Ответ дошёл до конца (response.done без отмены) — фиксируем его транскрипт
  // в диалоге интервью.
  private notifyCompletedAssistantResponse(responseId: string) {
    const pending = this.pendingTranscriptsByResponseId.get(responseId);
    this.pendingTranscriptsByResponseId.delete(responseId);
    if (!pending || this.announcementResponses.has(responseId)) return;
    this.sink.onAssistantTranscriptCompleted?.(pending.text, pending.messageId);
  }

  // Полностью убирает ответ из чата (отменённый «спор» модели с командой
  // перехода): удаляем пузырь, помечаем финализированным, ничего не сохраняем.
  private discardAssistantResponse(responseId: string) {
    this.finalizedAssistantResponses.add(responseId);
    this.pendingTranscriptsByResponseId.delete(responseId);
    const messageId = this.assistantMessagesByResponseId.get(responseId);
    if (messageId) {
      this.sink.removeMessage(messageId);
      this.assistantMessagesByResponseId.delete(responseId);
      this.assistantContentByResponseId.delete(responseId);
    }
  }

  private startAssistantSpeech(responseId: string) {
    if (this.speakingResponses.has(responseId)) return;
    this.speakingResponses.add(responseId);
    this.sink.onAssistantSpeechStarted?.();
  }

  private endAssistantSpeech(responseId: string) {
    if (!this.speakingResponses.has(responseId)) return;
    this.speakingResponses.delete(responseId);
    this.sink.onAssistantSpeechEnded?.();
  }

  private endAllAssistantSpeech() {
    if (!this.speakingResponses.size) return;
    this.speakingResponses.clear();
    this.sink.onAssistantSpeechEnded?.();
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
