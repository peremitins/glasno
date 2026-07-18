import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import routerConfig from './router.options';

const routerOptionsPath = 'app/router.options.ts';

describe('router scroll behavior', () => {
  it('opens new routes at the top and restores browser history positions', () => {
    expect(existsSync(routerOptionsPath)).toBe(true);

    const source = readFileSync(routerOptionsPath, 'utf8');

    expect(source).toContain('scrollBehavior');
    expect(source).toContain('savedPosition');
    expect(source).toContain('return savedPosition');
    expect(source).toContain('return { left: 0, top: 0 }');
  });

  it('returns the correct positions from the configured behavior', () => {
    const scrollBehavior = routerConfig.scrollBehavior as (
      to: never,
      from: never,
      savedPosition: { left: number; top: number } | null,
    ) => { left: number; top: number };
    const savedPosition = { left: 18, top: 640 };

    expect(scrollBehavior({} as never, {} as never, null)).toEqual({
      left: 0,
      top: 0,
    });
    expect(scrollBehavior({} as never, {} as never, savedPosition)).toBe(
      savedPosition,
    );
  });
});
