import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/interview/[id].vue', 'utf8');

function readZIndex(selector: string): number {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(
    new RegExp(`${escaped}\\s*\\{[\\s\\S]*?z-index:\\s*(\\d+)`)
  );
  if (!match?.[1]) throw new Error(`Не найден z-index для ${selector}`);
  return Number(match[1]);
}

describe('interviewer picker in fullscreen mode', () => {
  it('portals the picker overlay to body', () => {
    expect(source).toMatch(
      /<Teleport to="body">[\s\S]*?v-if="interviewerPickerOpen && state"[\s\S]*?class="picker-overlay"[\s\S]*?<\/Teleport>/
    );
  });

  it('keeps the picker above the fullscreen call layer', () => {
    expect(readZIndex('.picker-overlay')).toBeGreaterThan(
      readZIndex('.call--fs')
    );
  });
});
