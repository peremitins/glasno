import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeResponseScheduler } from './realtimeResponseScheduler';

describe('RealtimeResponseScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('запускает ответ только после выдержанной паузы тишины', () => {
    let fired = 0;
    const scheduler = new RealtimeResponseScheduler({
      getDelayMs: () => 2000,
      onElapsed: () => {
        fired += 1;
      },
    });

    scheduler.arm();
    expect(scheduler.pending).toBe(true);

    vi.advanceTimersByTime(1999);
    expect(fired).toBe(0);

    vi.advanceTimersByTime(1);
    expect(fired).toBe(1);
    expect(scheduler.pending).toBe(false);
  });

  it('отмена снимает отложенный ответ (кандидат заговорил снова)', () => {
    let fired = 0;
    const scheduler = new RealtimeResponseScheduler({
      getDelayMs: () => 2000,
      onElapsed: () => {
        fired += 1;
      },
    });

    scheduler.arm();
    vi.advanceTimersByTime(1000);
    scheduler.cancel();
    expect(scheduler.pending).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(fired).toBe(0);
  });

  it('повторный arm перезапускает окно тишины и не двоит ответ', () => {
    let fired = 0;
    const scheduler = new RealtimeResponseScheduler({
      getDelayMs: () => 2000,
      onElapsed: () => {
        fired += 1;
      },
    });

    scheduler.arm();
    vi.advanceTimersByTime(1500);
    // Новый сегмент реплики — окно тишины начинается заново.
    scheduler.arm();
    vi.advanceTimersByTime(1500);
    expect(fired).toBe(0);

    vi.advanceTimersByTime(500);
    expect(fired).toBe(1);
  });

  it('считывает актуальную паузу в момент постановки таймера', () => {
    let fired = 0;
    let delay = 1000;
    const scheduler = new RealtimeResponseScheduler({
      getDelayMs: () => delay,
      onElapsed: () => {
        fired += 1;
      },
    });

    delay = 4000;
    scheduler.arm();
    vi.advanceTimersByTime(1000);
    expect(fired).toBe(0);

    vi.advanceTimersByTime(3000);
    expect(fired).toBe(1);
  });

  it('dispose снимает активный таймер', () => {
    let fired = 0;
    const scheduler = new RealtimeResponseScheduler({
      getDelayMs: () => 2000,
      onElapsed: () => {
        fired += 1;
      },
    });

    scheduler.arm();
    scheduler.dispose();
    vi.advanceTimersByTime(5000);
    expect(fired).toBe(0);
    expect(scheduler.pending).toBe(false);
  });
});
