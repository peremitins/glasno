import type confetti from 'canvas-confetti';

type ConfettiOptions = NonNullable<Parameters<typeof confetti>[0]>;

const REPORT_CELEBRATION_COLORS = [
  '#7c5cff',
  '#67e8f9',
  '#f0abfc',
  '#fef3c7',
  '#ffffff',
];

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function withDefaults(options: ConfettiOptions): ConfettiOptions {
  return {
    colors: REPORT_CELEBRATION_COLORS,
    disableForReducedMotion: true,
    ticks: 220,
    ...options,
  };
}

export function useReportCelebrationConfetti() {
  async function launchReportCelebration() {
    if (typeof window === 'undefined' || prefersReducedMotion()) return;

    const { default: canvasConfetti } = await import('canvas-confetti');

    void canvasConfetti(
      withDefaults({
        particleCount: 48,
        spread: 68,
        startVelocity: 34,
        scalar: 0.86,
        origin: { x: 0.5, y: 0.6 },
      })
    );

    window.setTimeout(() => {
      void canvasConfetti(
        withDefaults({
          particleCount: 34,
          angle: 62,
          spread: 58,
          startVelocity: 38,
          scalar: 0.74,
          origin: { x: 0.08, y: 0.74 },
        })
      );
      void canvasConfetti(
        withDefaults({
          particleCount: 34,
          angle: 118,
          spread: 58,
          startVelocity: 38,
          scalar: 0.74,
          origin: { x: 0.92, y: 0.74 },
        })
      );
    }, 620);

    window.setTimeout(() => {
      void canvasConfetti(
        withDefaults({
          particleCount: 28,
          spread: 112,
          startVelocity: 24,
          decay: 0.92,
          scalar: 0.68,
          origin: { x: 0.5, y: 0.42 },
        })
      );
    }, 1420);
  }

  return {
    launchReportCelebration,
  };
}
