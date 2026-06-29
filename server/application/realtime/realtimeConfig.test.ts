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
    expect(instructions).toContain('не сохраняешь ответ');
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
