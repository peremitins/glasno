import { describe, expect, it } from 'vitest';
import { getRoleContextTags } from './roleContextTags';

describe('getRoleContextTags', () => {
  it('returns generic tags for empty input', () => {
    expect(getRoleContextTags('')).toEqual([]);
    expect(getRoleContextTags('   ')).toEqual([]);
  });

  it('falls back to generic tags for an unrecognized role', () => {
    expect(getRoleContextTags('Совершенно неизвестная профессия')).toEqual([
      'B2B',
      'B2C',
      'Стартап',
      'Крупная компания',
      'Удалёнка',
    ]);
  });

  it('matches newly added roles to dedicated (non-generic) tags', () => {
    expect(getRoleContextTags('Customer Success Manager')).toContain('SaaS');
    expect(getRoleContextTags('HR-бизнес-партнёр (HRBP)')).toContain('Оргдизайн');
    expect(getRoleContextTags('Growth/Performance-маркетолог')).toContain('Воронки');
    expect(getRoleContextTags('Репетитор')).toContain('Методика');
    expect(getRoleContextTags('AI-инженер / Prompt-инженер')).toContain('LLM');
    expect(getRoleContextTags('DevRel-менеджер (Developer Relations)')).toContain('Комьюнити');
    expect(getRoleContextTags('IT-рекрутер')).toContain('Сорсинг');
  });

  it('prioritizes the specific UX researcher rule over the generic UX/UI rule', () => {
    const tags = getRoleContextTags('UX-исследователь');
    expect(tags).toContain('Юзабилити-тесты');
    expect(tags).not.toContain('Дизайн-система');
  });

  it('still matches Product Owner to the product manager rule', () => {
    expect(getRoleContextTags('Product Owner / Владелец продукта')).toContain('Roadmap');
  });
});
