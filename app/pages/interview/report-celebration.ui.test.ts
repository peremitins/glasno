import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/interview/report/[id].vue', 'utf8');

describe('interview report status and celebration UI', () => {
  it('shows the animated report generation panel while a report is loading or processing', () => {
    expect(source).toContain('ReportGenerationPanel');
    expect(source).toContain('isReportBuilding');
    expect(source).toContain('scheduleReportRefresh');
  });

  it('keeps the report generation panel stable during polling refreshes', () => {
    const isReportBuildingStart = source.indexOf('const isReportBuilding = computed');
    const isReportBuildingEnd = source.indexOf('const celebrationLaunched', isReportBuildingStart);
    const isReportBuildingBlock = source.slice(isReportBuildingStart, isReportBuildingEnd);

    expect(source).toContain('isReportInitialLoading');
    expect(source).toContain('pending.value && !data.value');
    expect(source).toContain('v-if="isReportInitialLoading"');
    expect(isReportBuildingBlock).not.toContain('pending.value');
  });

  it('launches report celebration only through the high-score guard', () => {
    expect(source).toContain('useReportCelebrationConfetti');
    expect(source).toContain('shouldCelebrateReportScore');
    expect(source).toContain('celebrationLaunched');
  });
});
