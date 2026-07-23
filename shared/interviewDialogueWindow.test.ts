import { describe, expect, it } from 'vitest';
import {
  interviewDialogueSkipMarker,
  windowInterviewDialogue,
} from './interviewDialogueWindow';

function messages(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `m${index + 1}`);
}

describe('windowInterviewDialogue', () => {
  it('keeps a short dialogue untouched', () => {
    const result = windowInterviewDialogue(messages(20));

    expect(result.skipped).toBe(0);
    expect(result.head).toHaveLength(20);
    expect(result.tail).toEqual([]);
  });

  it('keeps the opening and the latest replies of a long dialogue', () => {
    const result = windowInterviewDialogue(messages(50));

    expect(result.head).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(result.tail).toHaveLength(16);
    expect(result.tail.at(-1)).toBe('m50');
    expect(result.skipped).toBe(30);
    // Ни одна реплика не теряется и не дублируется.
    expect(result.head.length + result.skipped + result.tail.length).toBe(50);
  });

  it('does not grow the window as the dialogue grows', () => {
    const short = windowInterviewDialogue(messages(40));
    const long = windowInterviewDialogue(messages(400));

    expect(long.head.length + long.tail.length).toBe(
      short.head.length + short.tail.length
    );
  });

  it('handles an empty dialogue', () => {
    expect(windowInterviewDialogue([])).toEqual({
      head: [],
      skipped: 0,
      tail: [],
    });
  });

  it('renders the skip marker with the number of hidden replies', () => {
    expect(interviewDialogueSkipMarker(30)).toContain('30');
  });
});
