export const HIGH_REPORT_SCORE_THRESHOLD = 80;

export function shouldCelebrateReportScore(
  score: number | null | undefined
): boolean {
  return typeof score === 'number' && score >= HIGH_REPORT_SCORE_THRESHOLD;
}
