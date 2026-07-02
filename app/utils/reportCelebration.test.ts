import { describe, expect, it } from 'vitest';
import {
  HIGH_REPORT_SCORE_THRESHOLD,
  shouldCelebrateReportScore,
} from './reportCelebration';

describe('report celebration threshold', () => {
  it('celebrates only high interview scores', () => {
    expect(HIGH_REPORT_SCORE_THRESHOLD).toBe(80);
    expect(shouldCelebrateReportScore(80)).toBe(true);
    expect(shouldCelebrateReportScore(92)).toBe(true);
    expect(shouldCelebrateReportScore(79)).toBe(false);
    expect(shouldCelebrateReportScore(null)).toBe(false);
  });
});
