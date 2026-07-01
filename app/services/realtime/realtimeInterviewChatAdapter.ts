type RealtimeServerEvent = {
  type?: string;
  [key: string]: unknown;
};

export type RealtimeInterviewChatSink = {
  createMessage: (role: 'user' | 'assistant', content: string) => string;
  appendContent: (messageId: string, delta: string) => void;
  replaceContent: (messageId: string, content: string) => void;
  removeMessage: (messageId: string) => void;
  onUserTranscriptCompleted?: (transcript: string) => void;
  onAssistantTranscriptCompleted?: (transcript: string) => void;
  // Интервьюер начал/закончил говорить (realtime-аудио). Нужно для анимации
  // «говорящего» аватара: старт — на первой транскрипт-дельте ответа,
  // конец — на завершении ответа.
  onAssistantSpeechStarted?: () => void;
  onAssistantSpeechEnded?: () => void;
};

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
        if (!itemId) return;
        if (transcript) {
          this.replaceUserContent(itemId, transcript);
          this.sink.onUserTranscriptCompleted?.(transcript);
          return;
        }
        if (!this.userContentByItemId.get(itemId)?.trim()) {
          this.removeUserMessage(itemId);
        }
        return;
      }

      case 'conversation.item.input_audio_transcription.failed': {
        const itemId = stringValue(event.item_id);
        if (itemId) this.removeUserMessage(itemId);
        return;
      }

      case 'response.created': {
        const responseId = stringValue(
          (event.response as { id?: unknown } | undefined)?.id
        );
        if (responseId) this.startAssistantSpeech(responseId);
        return;
      }

      case 'output_audio_buffer.started': {
        const responseId = stringValue(event.response_id);
        if (responseId) this.startAssistantSpeech(responseId);
        return;
      }

      case 'output_audio_buffer.stopped': {
        const responseId = stringValue(event.response_id);
        if (responseId) this.endAssistantSpeech(responseId);
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
        this.endAssistantSpeech(responseId);
        if (this.finalizedAssistantResponses.has(responseId)) {
          return;
        }
        const fallbackText = extractFinalAssistantText(response);
        if (!fallbackText) return;
        this.ensureAssistantMessage(responseId);
        this.finalizeAssistantResponse(responseId, fallbackText);
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
    const messageId = this.sink.createMessage('user', '');
    this.userMessagesByItemId.set(itemId, messageId);
    this.userContentByItemId.set(itemId, '');
    return messageId;
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
    const messageId = this.ensureAssistantMessage(responseId);
    this.startAssistantSpeech(responseId);
    const content = `${this.assistantContentByResponseId.get(responseId) || ''}${delta}`;
    this.assistantContentByResponseId.set(responseId, content);
    this.sink.appendContent(messageId, delta);
  }

  private finalizeAssistantResponse(responseId: string, finalText: string) {
    // Ответ завершён — интервьюер закончил говорить (снимаем анимацию).
    this.endAssistantSpeech(responseId);
    const messageId = this.assistantMessagesByResponseId.get(responseId);
    if (!messageId) return;
    const normalized = finalText.trim();
    if (normalized) {
      this.assistantContentByResponseId.set(responseId, normalized);
      this.sink.replaceContent(messageId, normalized);
      this.sink.onAssistantTranscriptCompleted?.(normalized);
    }
    if (!this.assistantContentByResponseId.get(responseId)?.trim()) {
      this.sink.removeMessage(messageId);
      this.assistantMessagesByResponseId.delete(responseId);
      this.assistantContentByResponseId.delete(responseId);
    }
    this.finalizedAssistantResponses.add(responseId);
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
