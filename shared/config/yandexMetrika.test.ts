import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('shared/config/yandexMetrika.ts', 'utf8');

describe('Yandex Metrika counter config', () => {
  it('keeps the shared counter ID as a string', () => {
    expect(source).toContain("'110383411'");
  });
});
