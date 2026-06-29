export type SpeechEngineId = 'webspeech' | 'whisper' | 'auto';

export interface SpeechEngineOptions {
  language?: string;
  silenceMs?: number;
  continuousMode?: boolean;
}

export interface SpeechEngine {
  start(opts?: SpeechEngineOptions): Promise<void>;
  stop(): Promise<void>;
  onPartial(cb: (text: string) => void): void;
  onFinal(cb: (text: string) => void): void;
  onError(cb: (error: unknown) => void): void;
  isAvailable(): boolean;
}
