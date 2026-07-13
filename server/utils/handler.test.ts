import { describe, expect, it } from 'vitest';
import { stripQueryString } from './handler';

describe('stripQueryString', () => {
  it('обрезает query-параметры из пути запроса', () => {
    expect(stripQueryString('/api/auth/magic/consume?token=SECRET123')).toBe(
      '/api/auth/magic/consume'
    );
  });

  it('не трогает путь без query-параметров', () => {
    expect(stripQueryString('/api/auth/me')).toBe('/api/auth/me');
  });

  it('обрезает всё после первого "?", включая несколько параметров', () => {
    expect(stripQueryString('/api/billing/status?a=1&token=SECRET&b=2')).toBe(
      '/api/billing/status'
    );
  });
});
