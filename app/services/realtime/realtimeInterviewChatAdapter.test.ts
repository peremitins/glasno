import { describe, expect, it } from 'vitest';
import { RealtimeInterviewChatAdapter } from './realtimeInterviewChatAdapter';

describe('RealtimeInterviewChatAdapter', () => {
  it('maps realtime user and assistant transcript events into chat messages', () => {
    const messages = new Map<string, { role: 'user' | 'assistant'; content: string }>();
    let counter = 0;
    const completedUserTranscripts: string[] = [];

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
