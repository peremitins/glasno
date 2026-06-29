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

      case 'response.audio_transcript.delta': {
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

      case 'response.done': {
        const response = event.response;
        const responseId = stringValue((response as { id?: unknown } | undefined)?.id);
        if (!responseId || this.finalizedAssistantResponses.has(responseId)) {
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
    const content = `${this.assistantContentByResponseId.get(responseId) || ''}${delta}`;
    this.assistantContentByResponseId.set(responseId, content);
    this.sink.appendContent(messageId, delta);
  }

  private finalizeAssistantResponse(responseId: string, finalText: string) {
    const messageId = this.assistantMessagesByResponseId.get(responseId);
    if (!messageId) return;
    const normalized = finalText.trim();
    if (normalized) {
      this.assistantContentByResponseId.set(responseId, normalized);
      this.sink.replaceContent(messageId, normalized);
    }
    if (!this.assistantContentByResponseId.get(responseId)?.trim()) {
      this.sink.removeMessage(messageId);
      this.assistantMessagesByResponseId.delete(responseId);
      this.assistantContentByResponseId.delete(responseId);
    }
    this.finalizedAssistantResponses.add(responseId);
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
