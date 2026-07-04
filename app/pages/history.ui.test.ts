import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/history.vue', 'utf8');

describe('interview history interactions', () => {
  it('opens the relevant interview destination from the whole row', () => {
    expect(source).toContain('historyItemPath');
    expect(source).toContain('openHistoryItem');
    expect(source).toContain('@click="openHistoryItem(item)"');
    expect(source).toContain('role="link"');
    expect(source).toContain('@keydown.enter.prevent="openHistoryItem(item)"');
  });

  it('uses a review-oriented label instead of the generic history label for completed sessions without a report', () => {
    expect(source).toContain('history.openReview');
    expect(source).not.toContain("t('nav.history')");
  });

  it('does not replace an existing history list with skeleton during refreshes', () => {
    expect(source).toContain('historyInitialPending');
    expect(source).toContain('pending.value && !data.value');
    expect(source).toContain('v-if="historyInitialPending"');
  });

  it('renders history text with tooltip-only learning terms inside clickable rows', () => {
    expect(source).toContain('TextWithInterviewTerms');
    expect(source).toContain("kind: 'history'");
    expect(source).toContain(':interactive="false"');
  });
});
