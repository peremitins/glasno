import { describe, expect, it } from 'vitest';
import {
  PROFESSIONAL_ROLE_CATEGORIES,
  PROFESSIONAL_ROLE_OPTIONS,
} from './professionalRoles';

describe('hardcoded Russian professional roles', () => {
  it('keeps the curated HeadHunter professional role taxonomy snapshot locally', () => {
    expect(PROFESSIONAL_ROLE_CATEGORIES).toHaveLength(25);
    expect(PROFESSIONAL_ROLE_OPTIONS.length).toBeGreaterThan(220);
  });

  it('contains common Russian-market categories and roles', () => {
    const labels = PROFESSIONAL_ROLE_OPTIONS.map((role) => role.name);

    expect(labels).toContain('Программист, разработчик');
    expect(labels).toContain(
      'Менеджер по продажам, менеджер по работе с клиентами'
    );
    expect(labels).toContain('Бухгалтер');
    expect(labels).toContain('Юрист');
    expect(labels).toContain('Врач');
  });

  it('excludes professions without a real interview-prep culture in Russia', () => {
    const labels = PROFESSIONAL_ROLE_OPTIONS.map((role) => role.name);

    expect(labels).not.toContain('Автомойщик');
    expect(labels).not.toContain('Грузчик');
    expect(labels).not.toContain('Сварщик');
    expect(labels).not.toContain('Парикмахер');
    expect(labels).not.toContain('Разнорабочий');
    expect(labels).not.toContain('Артист, актер, аниматор');
  });

  it('no longer has the emptied-out blue-collar categories', () => {
    const categoryNames = PROFESSIONAL_ROLE_CATEGORIES.map((category) => category.name);

    expect(categoryNames).not.toContain('Рабочий персонал');
    expect(categoryNames).not.toContain('Домашний, обслуживающий персонал');
  });

  it('contains newly added in-demand roles', () => {
    const labels = PROFESSIONAL_ROLE_OPTIONS.map((role) => role.name);

    expect(labels).toContain('Customer Success Manager');
    expect(labels).toContain('HR-бизнес-партнёр (HRBP)');
    expect(labels).toContain('Growth/Performance-маркетолог');
    expect(labels).toContain('Репетитор');
  });
});
