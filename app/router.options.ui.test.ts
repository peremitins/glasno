import { existsSync, readFileSync } from 'node:fs';
import { START_LOCATION } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import routerConfig from './router.options';

const routerOptionsPath = 'app/router.options.ts';

type Position = { left: number; top: number; behavior?: string };

type Route = { path: string; hash: string };

const route = (path: string, hash = ''): Route => ({ path, hash });

const scrollBehavior = routerConfig.scrollBehavior as (
  to: Route,
  from: Route | typeof START_LOCATION,
  savedPosition: { left: number; top: number } | null,
) => Position | false | Promise<Position>;

// Хуки Nuxt стабятся: в юнит-окружении нет приложения, а поведение
// «скроллим после page:loading:end» проверяем немедленным вызовом колбэка.
function stubNuxtRuntime() {
  const hookOnce = vi.fn(
    (_name: string, callback: () => void): void => callback(),
  );
  vi.stubGlobal('useNuxtApp', () => ({ hooks: { hookOnce } }));
  return hookOnce;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('router scroll behavior', () => {
  it('waits for the page render and scrolls without smooth animation', () => {
    expect(existsSync(routerOptionsPath)).toBe(true);

    const source = readFileSync(routerOptionsPath, 'utf8');

    expect(source).toContain('scrollBehavior');
    expect(source).toContain('savedPosition');
    expect(source).toContain("hookOnce('page:loading:end'");
    expect(source).toContain("behavior: 'instant'");
  });

  it('opens a new page at the top after the page has rendered', async () => {
    const hookOnce = stubNuxtRuntime();

    const result = await scrollBehavior(route('/history'), route('/'), null);

    expect(hookOnce).toHaveBeenCalledWith(
      'page:loading:end',
      expect.any(Function),
    );
    expect(result).toEqual({ left: 0, top: 0, behavior: 'instant' });
  });

  it('restores the saved history position on back/forward navigation', async () => {
    stubNuxtRuntime();

    const savedPosition = { left: 18, top: 640 };
    const result = await scrollBehavior(
      route('/history'),
      route('/'),
      savedPosition,
    );

    expect(result).toEqual({ ...savedPosition, behavior: 'instant' });
  });

  it('keeps the position on same-page navigation and scrolls to anchors', () => {
    expect(scrollBehavior(route('/profile'), route('/profile'), null)).toBe(
      false,
    );
    expect(
      scrollBehavior(route('/profile', '#plans'), route('/profile'), null),
    ).toEqual({ el: '#plans', behavior: 'smooth' });
    expect(
      scrollBehavior(route('/profile'), route('/profile', '#plans'), null),
    ).toEqual({ left: 0, top: 0 });
  });

  it('does not wait for hooks on the very first navigation', () => {
    const result = scrollBehavior(route('/'), START_LOCATION, null);

    expect(result).toEqual({ left: 0, top: 0 });
  });
});
