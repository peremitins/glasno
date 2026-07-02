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
    adapter.handleServerEvent({
      type: 'response.done',
      response: { id: 'response_1', status: 'completed', output: [] },
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
    adapter.handleServerEvent({
      type: 'response.done',
      response: { id: 'response_1', status: 'completed', output: [] },
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

  it('reuses one empty user bubble when a reply arrives under different item ids', () => {
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
        if (message) message.content += delta;
      },
      replaceContent(messageId, content) {
        const message = messages.get(messageId);
        if (message) message.content = content;
      },
      removeMessage(messageId) {
        messages.delete(messageId);
      },
      onUserTranscriptCompleted(transcript) {
        completedUserTranscripts.push(transcript);
      },
    });

    // VAD и создание item иногда несут РАЗНЫЕ item_id для одной реплики —
    // раньше это плодило два пустых пузыря. Теперь должен остаться ровно один.
    adapter.handleServerEvent({
      type: 'input_audio_buffer.speech_started',
      item_id: 'user_item_vad',
    });
    adapter.handleServerEvent({
      type: 'conversation.item.created',
      item: { id: 'user_item_committed', role: 'user' },
    });

    expect(messages.size).toBe(1);

    adapter.handleServerEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'user_item_committed',
      transcript: 'Мой ответ на вопрос.',
    });

    expect(messages.size).toBe(1);
    expect([...messages.values()]).toEqual([
      { role: 'user', content: 'Мой ответ на вопрос.' },
    ]);
    expect(completedUserTranscripts).toEqual(['Мой ответ на вопрос.']);
  });

  it('keeps interviewer speaking until audio playback actually stops', () => {
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
      type: 'output_audio_buffer.started',
      response_id: 'response_1',
    });
    // Текст и завершение запроса приходят ДО конца озвучки — анимация держится.
    adapter.handleServerEvent({
      type: 'response.output_audio_transcript.done',
      response_id: 'response_1',
      transcript: 'Хорошо, расскажите подробнее.',
    });
    adapter.handleServerEvent({
      type: 'response.done',
      response: { id: 'response_1', status: 'completed', output: [] },
    });

    expect(assistantSpeechStarted).toBe(1);
    expect(assistantSpeechEnded).toBe(0);

    // Звук реально доиграл — только теперь гасим анимацию.
    adapter.handleServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: 'response_1',
    });
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

  it('voices question announcements without chat bubbles or persistence', () => {
    const messages = new Map<string, { role: string; content: string }>();
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
      appendContent() {},
      replaceContent() {},
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
      response: {
        id: 'response_announce',
        metadata: { jobai_kind: 'question_announcement' },
      },
    });
    adapter.handleServerEvent({
      type: 'response.output_audio_transcript.delta',
      response_id: 'response_announce',
      item_id: 'assistant_item_1',
      delta: 'Хорошо, следующий вопрос…',
    });
    adapter.handleServerEvent({
      type: 'response.output_audio_transcript.done',
      response_id: 'response_announce',
      transcript: 'Хорошо, следующий вопрос: расскажите о конфликте в команде.',
    });
    adapter.handleServerEvent({
      type: 'response.done',
      response: { id: 'response_announce', status: 'completed', output: [] },
    });

    // Голос и анимация есть, но чат и диалог не трогаем.
    expect(messages.size).toBe(0);
    expect(completedAssistantTranscripts).toEqual([]);
    expect(assistantSpeechStarted).toBe(1);
    expect(assistantSpeechEnded).toBe(1);
  });

  it('drops cancelled assistant responses from chat without persistence', () => {
    const messages = new Map<string, { role: string; content: string }>();
    let counter = 0;
    const completedAssistantTranscripts: string[] = [];

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
      replaceContent() {},
      removeMessage(messageId) {
        messages.delete(messageId);
      },
      onAssistantTranscriptCompleted(transcript) {
        completedAssistantTranscripts.push(transcript);
      },
    });

    // Модель начала спорить с командой «следующий вопрос», её оборвали.
    // При отмене OpenAI успевает прислать transcript.done с частичным текстом
    // ДО response.done(cancelled) — он не должен сохраняться в диалог.
    adapter.handleServerEvent({
      type: 'response.created',
      response: { id: 'response_argue' },
    });
    adapter.handleServerEvent({
      type: 'response.output_audio_transcript.delta',
      response_id: 'response_argue',
      item_id: 'assistant_item_1',
      delta: 'Давайте сначала завершим ',
    });
    adapter.handleServerEvent({
      type: 'response.output_audio_transcript.done',
      response_id: 'response_argue',
      transcript: 'Давайте сначала завершим обсуждение текущего вопроса.',
    });
    adapter.handleServerEvent({
      type: 'response.done',
      response: { id: 'response_argue', status: 'cancelled', output: [] },
    });

    expect(messages.size).toBe(0);
    expect(completedAssistantTranscripts).toEqual([]);
  });

  it('removes empty user bubbles when transcription fails', () => {
    const messageIds: string[] = [];
    const removed: string[] = [];
    let transcriptFailures = 0;
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
      onUserTranscriptFailed() {
        transcriptFailures += 1;
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
    // Страница по этому колбэку явно запрашивает ответ интервьюера.
    expect(transcriptFailures).toBe(1);
  });

  it('passes runtime message ids with completed transcripts for reconciliation', () => {
    const userCompletions: Array<[string, string]> = [];
    const assistantCompletions: Array<[string, string]> = [];
    let counter = 0;
    const adapter = new RealtimeInterviewChatAdapter({
      createMessage() {
        counter += 1;
        return `message_${counter}`;
      },
      appendContent() {},
      replaceContent() {},
      removeMessage() {},
      onUserTranscriptCompleted(transcript, messageId) {
        userCompletions.push([transcript, messageId]);
      },
      onAssistantTranscriptCompleted(transcript, messageId) {
        assistantCompletions.push([transcript, messageId]);
      },
    });

    adapter.handleServerEvent({
      type: 'input_audio_buffer.speech_started',
      item_id: 'user_item_1',
    });
    adapter.handleServerEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'user_item_1',
      transcript: 'Добрый день, давайте начнем.',
    });
    adapter.handleServerEvent({
      type: 'response.created',
      response: { id: 'response_1' },
    });
    adapter.handleServerEvent({
      type: 'response.output_audio_transcript.delta',
      response_id: 'response_1',
      item_id: 'assistant_item_1',
      delta: 'Добрый день.',
    });
    adapter.handleServerEvent({
      type: 'response.output_audio_transcript.done',
      response_id: 'response_1',
      transcript: 'Добрый день. Расскажите о приоритетах.',
    });
    adapter.handleServerEvent({
      type: 'response.done',
      response: { id: 'response_1', status: 'completed', output: [] },
    });

    expect(userCompletions).toEqual([
      ['Добрый день, давайте начнем.', 'message_1'],
    ]);
    expect(assistantCompletions).toEqual([
      ['Добрый день. Расскажите о приоритетах.', 'message_2'],
    ]);
  });
});
