export interface RealtimeResponseSchedulerOptions {
  // Актуальная пауза (мс). Считывается в момент постановки таймера, чтобы
  // смена ползунка применялась начиная со следующего хода.
  getDelayMs: () => number;
  // Пауза выдержана — можно запускать ответ интервьюера (response.create).
  onElapsed: () => void;
  // Инъекция таймеров — для юнит-тестов с фейковыми таймерами.
  setTimeoutFn?: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}

// Клиентское «окно тишины» перед ответом интервьюера.
//
// semantic_vad решает конец хода по смыслу и режет на естественных паузах:
// закончил грамматически цельную фразу — модель считает, что ход завершён, и
// приложение сразу шлёт response.create. Чтобы дать кандидату договорить,
// ответ откладываем на настраиваемую паузу (arm) и снимаем, если кандидат
// заговорил снова (cancel). Таймер один и всегда перезапускается — за один
// ход ответ уходит ровно один раз.
export class RealtimeResponseScheduler {
  private handle: ReturnType<typeof setTimeout> | null = null;
  private readonly getDelayMs: () => number;
  private readonly onElapsed: () => void;
  private readonly setTimeoutFn: (
    handler: () => void,
    ms: number
  ) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (
    handle: ReturnType<typeof setTimeout>
  ) => void;

  constructor(options: RealtimeResponseSchedulerOptions) {
    this.getDelayMs = options.getDelayMs;
    this.onElapsed = options.onElapsed;
    this.setTimeoutFn =
      options.setTimeoutFn ?? ((handler, ms) => setTimeout(handler, ms));
    this.clearTimeoutFn =
      options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
  }

  // Ставит/перезапускает окно тишины. Идемпотентно: повторный вызов сбрасывает
  // предыдущий таймер и отсчитывает паузу заново.
  arm(): void {
    this.cancel();
    const delay = Math.max(0, this.getDelayMs());
    this.handle = this.setTimeoutFn(() => {
      this.handle = null;
      this.onElapsed();
    }, delay);
  }

  // Снимает отложенный ответ (кандидат продолжил речь, команда перехода,
  // остановка сессии и т.п.).
  cancel(): void {
    if (this.handle === null) return;
    this.clearTimeoutFn(this.handle);
    this.handle = null;
  }

  get pending(): boolean {
    return this.handle !== null;
  }

  dispose(): void {
    this.cancel();
  }
}
