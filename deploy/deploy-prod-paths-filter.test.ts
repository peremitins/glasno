import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/deploy-prod.yml', 'utf8');

describe('production deploy path filters', () => {
  it('runs the landing deployment when any landing-related path changes', () => {
    expect(workflow).toContain(
      "landing: ${{ steps.landing-filter.outputs.landing }}"
    );
    expect(workflow).toMatch(
      /id: landing-filter\n\s{8}uses: dorny\/paths-filter@v3\n\s{8}with:\n\s{10}predicate-quantifier: 'some'/
    );
    expect(workflow).toMatch(
      /landing:\n\s{14}- 'apps\/landing\/\*\*'\n\s{14}- 'deploy\/landing\/\*\*'\n\s{14}- '\.github\/workflows\/deploy-prod\.yml'/
    );
  });

  it('keeps application-only deployment exclusions intact', () => {
    expect(workflow).toContain("app: ${{ steps.app-filter.outputs.app }}");
    expect(workflow).toMatch(
      /id: app-filter\n\s{8}uses: dorny\/paths-filter@v3\n\s{8}with:\n\s{10}predicate-quantifier: 'every'/
    );
  });
});
