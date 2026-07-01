import { describe, expect, it } from 'vitest';
import { RealtimeInterviewChatAdapter } from './realtimeInterviewChatAdapter';

describe('RealtimeInterviewChatAdapter', () => {
  it('maps realtime user and assistant transcript events into chat messages', () => {
    const messages = new Map<string, { role: 'user' | 'assistant'; content: string }>();
    let counter = 0;
    const completedUserTranscripts: string[] = [];
    const completedAssistantTranscripts: string[] = [];
    let assistantSpeechStarted = 0;
    let assistantSpeechEnded = 0;

    const adapter = new RealtimeInterviewChatAdapter({
      createMessage(role, content) {
        counter += 1;
        const id = `message_${counter}`;
        messages.set(id, { role, content });
        return id;
      },
      appendContent(messageId, delta) {
        const message = messages.get(messageId);
        if (!message) return;
        message.content += delta;
      },
      replaceContent(messageId, content) {
        const message = messages.get(messageId);
        if (!message) return;
        message.content = content;
      },
      removeMessage(messageId) {
        messages.delete(messageId);
      },
      onUserTranscriptCompleted(transcript) {
        completedUserTranscripts.push(transcript);
      },
      onAssistantTranscriptCompleted(transcript) {
        completedAssistantTranscripts.push(transcript);
      },
      onAssistantSpeechStarted() {
        assistantSpeechStarted += 1;
      },
      onAssistantSpeechEnded() {
        assistantSpeechEnded += 1;
      },
    });

    adapter.handleServerEvent({
      type: 'input_audio_buffer.speech_started',
      item_id: 'user_item_1',
    });
    adapter.handleServerEvent({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'user_item_1',
      delta: 'Я увеличил ',
    });
    adapter.handleServerEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'user_item_1',
      transcript: 'Я увеличил конверсию на 18%.',
    });
    adapter.handleServerEvent({
      type: 'response.audio_transcript.delta',
      response_id: 'response_1',
      item_id: 'assistant_item_1',
      delta: 'Хорошо, ',
    });
    adapter.handleServerEvent({
      type: 'response.audio_transcript.done',
      response_id: 'response_1',
      transcript: 'Хорошо, добавьте контекст задачи.',
    });

    expect([...messages.values()]).toEqual([
      { role: 'user', content: 'Я увеличил конверсию на 18%.' },
      { role: 'assistant', content: 'Хорошо, добавьте контекст задачи.' },
    ]);
    expect(completedUserTranscripts).toEqual(['Я увеличил конверсию на 18%.']);
    expect(completedAssistantTranscripts).toEqual([
      'Хорошо, добавьте контекст задачи.',
    ]);
    expect(assistantSpeechStarted).toBe(1);
    expect(assistantSpeechEnded).toBe(1);
  });

  it('supports current realtime output audio transcript events', () => {
    const messages = new Map<string, { role: 'user' | 'assistant'; content: string }>();
    let counter = 0;
    const completedAssistantTranscripts: string[] = [];
    let assistantSpeechStarted = 0;
    let assistantSpeechEnded = 0;

    const adapter = new RealtimeInterviewChatAdapter({
      createMessage(role, content) {
        counter += 1;
        const id = `message_${counter}`;
        messages.set(id, { role, content });
        return id;
      },
      appendContent(messageId, delta) {
        const message = messages.get(messageId);
        if (message) message.content += delta;
      },
      replaceContent(messageId, content) {
        const message = messages.get(messageId);
        if (message) message.content = content;
      },
      removeMessage(messageId) {
        messages.delete(messageId);
      },
      onAssistantTranscriptCompleted(transcript) {
        completedAssistantTranscripts.push(transcript);
      },
      onAssistantSpeechStarted() {
        assistantSpeechStarted += 1;
      },
      onAssistantSpeechEnded() {
        assistantSpeechEnded += 1;
      },
    });

    adapter.handleServerEvent({
      type: 'response.created',
      response: { id: 'response_1' },
    });
    adapter.handleServerEvent({
      type: 'response.output_audio_transcript.delta',
      response_id: 'response_1',
      item_id: 'assistant_item_1',
      delta: 'Да, ',
    });
    adapter.handleServerEvent({
      type: 'response.output_audio_transcript.delta',
      response_id: 'response_1',
      item_id: 'assistant_item_1',
      delta: 'продолжайте.',
    });
    adapter.handleServerEvent({
      type: 'response.output_audio_transcript.done',
      response_id: 'response_1',
      transcript: 'Да, продолжайте.',
    });

    expect([...messages.values()]).toEqual([
      { role: 'assistant', content: 'Да, продолжайте.' },
    ]);
    expect(completedAssistantTranscripts).toEqual(['Да, продолжайте.']);
    expect(assistantSpeechStarted).toBe(1);
    expect(assistantSpeechEnded).toBe(1);
  });

  it('ends assistant speaking state when realtime response finishes without transcript', () => {
    let assistantSpeechStarted = 0;
    let assistantSpeechEnded = 0;
    const adapter = new RealtimeInterviewChatAdapter({
      createMessage() {
        return 'message_1';
      },
      appendContent() {},
      replaceContent() {},
      removeMessage() {},
      onAssistantSpeechStarted() {
        assistantSpeechStarted += 1;
      },
      onAssistantSpeechEnded() {
        assistantSpeechEnded += 1;
      },
    });

    adapter.handleServerEvent({
      type: 'response.created',
      response: { id: 'response_1' },
    });
    adapter.handleServerEvent({
      type: 'response.done',
      response: {
        id: 'response_1',
        output: [],
      },
    });

    expect(assistantSpeechStarted).toBe(1);
    expect(assistantSpeechEnded).toBe(1);
  });

  it('clears assistant speaking state when response done has no id', () => {
    let assistantSpeechStarted = 0;
    let assistantSpeechEnded = 0;
    const adapter = new RealtimeInterviewChatAdapter({
      createMessage() {
        return 'message_1';
      },
      appendContent() {},
      replaceContent() {},
      removeMessage() {},
      onAssistantSpeechStarted() {
        assistantSpeechStarted += 1;
      },
      onAssistantSpeechEnded() {
        assistantSpeechEnded += 1;
      },
    });

    adapter.handleServerEvent({
      type: 'response.created',
      response: { id: 'response_1' },
    });
    adapter.handleServerEvent({
      type: 'response.done',
      response: {},
    });

    expect(assistantSpeechStarted).toBe(1);
    expect(assistantSpeechEnded).toBe(1);
  });

  it('removes empty user bubbles when transcription fails', () => {
    const messageIds: string[] = [];
    const removed: string[] = [];
    const adapter = new RealtimeInterviewChatAdapter({
      createMessage() {
        const id = `message_${messageIds.length + 1}`;
        messageIds.push(id);
        return id;
      },
      appendContent() {},
      replaceContent() {},
      removeMessage(messageId) {
        removed.push(messageId);
      },
    });

    adapter.handleServerEvent({
      type: 'input_audio_buffer.speech_started',
      item_id: 'user_item_1',
    });
    adapter.handleServerEvent({
      type: 'conversation.item.input_audio_transcription.failed',
      item_id: 'user_item_1',
    });

    expect(messageIds).toEqual(['message_1']);
    expect(removed).toEqual(['message_1']);
  });
});
