import { describe, expect, it } from 'vitest';
import {
  buildRealtimeInstructions,
  buildRealtimeSessionPayload,
} from './realtimeConfig';

describe('realtimeConfig', () => {
  const context = {
    sessionId: 'session_1',
    role: 'Product Manager',
    level: 'senior',
    interviewerMode: 'strict',
    vacancyTitle: 'Senior Product Manager',
    companyName: 'Jobai',
    currentQuestion: 'Расскажите о запуске сложного продукта.',
  };

  it('builds Russian interview instructions scoped to the current question', () => {
    const instructions = buildRealtimeInstructions(context);

    expect(instructions).toContain('говори по-русски');
    expect(instructions).toContain('Senior Product Manager');
    expect(instructions).toContain('Расскажите о запуске сложного продукта.');
    expect(instructions).toContain('переход выполняет приложение');
    // Команда «следующий вопрос» — для приложения: модель не должна отвечать.
    expect(instructions).toContain('НЕ отвечай на неё');
    expect(instructions).toContain('другой вопрос');
    expect(instructions).not.toContain('не сохраняешь ответ');
  });

  it('includes interviewer gender grammar instruction', () => {
    const instructions = buildRealtimeInstructions({
      ...context,
      interviewerGender: 'female',
    });

    expect(instructions).toContain('женский');
    expect(instructions).toContain('поняла');
  });

  it('builds an OpenAI Realtime session payload with audio modalities', () => {
    const payload = buildRealtimeSessionPayload(context, {
      model: 'gpt-realtime',
      voice: 'marin',
      transcriptionModel: 'gpt-4o-mini-transcribe',
    });

    expect(payload).toMatchObject({
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        audio: {
          input: {
            transcription: {
              model: 'gpt-4o-mini-transcribe',
            },
            turn_detection: {
              type: 'semantic_vad',
              // Ответ ассистента создаёт клиент явно после транскрипта —
              // иначе модель успевает заговорить на команду «следующий вопрос».
              create_response: false,
              interrupt_response: false,
            },
          },
          output: {
            voice: 'marin',
          },
        },
      },
    });
    expect(payload.session.instructions).toContain('Product Manager');
  });
});
