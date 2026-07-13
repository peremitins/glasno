import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  isListening: false,
  setListening(value: boolean) {
    this.isListening = value;
  },
}));

vi.mock('@/app/stores/speech', () => ({
  useSpeechStore: () => store,
}));

interface MockResult {
  isFinal: boolean;
  0: { transcript: string };
}

function makeResult(transcript: string, isFinal: boolean): MockResult {
  return { isFinal, 0: { transcript } };
}

class MockRecognition {
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  emit(results: MockResult[], resultIndex = 0) {
    this.onresult?.({ resultIndex, results });
  }
}

let instances: MockRecognition[] = [];

async function loadEngine() {
  const mod = await import('./engine.webspeech');
  return mod.createWebSpeechEngine();
}

describe('createWebSpeechEngine — накопление interim', () => {
  beforeEach(() => {
    instances = [];
    store.isListening = false;
    (globalThis as any).window = {
      SpeechRecognition: class extends MockRecognition {
        constructor() {
          super();
          instances.push(this as unknown as MockRecognition);
        }
      },
    };
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).window;
  });

  it('склеивает несколько промежуточных сегментов одной реплики, а не только последний', async () => {
    const engine = await loadEngine();
    const partials: string[] = [];
    engine.onPartial((text) => partials.push(text));

    await engine.start({ continuousMode: true });
    const recognition = instances[0]!;

    // Chrome в continuous-режиме отдаёт текущую (ещё не финальную) реплику
    // несколькими interim-результатами. Финализация — только после паузы.
    recognition.emit([
      makeResult('привет меня зовут', false),
      makeResult(' иван я работал в компании', false),
    ]);

    expect(partials.at(-1)).toBe('привет меня зовут иван я работал в компании');
  });

  it('сохраняет ранние interim-сегменты, когда обновляется только последний', async () => {
    const engine = await loadEngine();
    const partials: string[] = [];
    engine.onPartial((text) => partials.push(text));

    await engine.start({ continuousMode: true });
    const recognition = instances[0]!;

    recognition.emit([makeResult('сначала я собрал требования', false)]);
    recognition.emit(
      [
        makeResult('сначала я собрал требования', false),
        makeResult(' потом согласовал SLA', false),
      ],
      1
    );

    expect(partials.at(-1)).toBe(
      'сначала я собрал требования потом согласовал SLA'
    );
  });

  it('после паузы отдаёт весь надиктованный текст как финал', async () => {
    const engine = await loadEngine();
    const finals: string[] = [];
    engine.onFinal((text) => finals.push(text));

    await engine.start({ continuousMode: true });
    const recognition = instances[0]!;

    recognition.emit([
      makeResult('привет меня зовут иван', true),
      makeResult(' я работал в компании пять лет', true),
    ]);

    expect(finals.at(-1)).toBe(
      'привет меня зовут иван я работал в компании пять лет'
    );
  });
});
