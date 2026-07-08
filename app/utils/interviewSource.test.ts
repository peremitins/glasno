import { describe, expect, it } from 'vitest';
import {
  buildManualInterviewSource,
  isManualInterviewSourceReady,
  resolveProfessionSelection,
} from './interviewSource';

describe('manual interview source', () => {
  it('uses profession source when the user provides only a role', () => {
    expect(
      buildManualInterviewSource({
        role: 'Product Manager',
        specialization: 'B2B SaaS',
        vacancyText: '',
      })
    ).toEqual({
      type: 'profession',
      role: 'Product Manager',
      specialization: 'B2B SaaS',
    });
  });

  it('uses text source when the user adds a vacancy description', () => {
    expect(
      buildManualInterviewSource({
        role: 'Product Manager',
        specialization: 'B2B SaaS',
        vacancyText: 'Нужно вести discovery, roadmap и запуск новых продуктов.',
      })
    ).toEqual({
      type: 'text',
      text: 'Нужно вести discovery, roadmap и запуск новых продуктов.',
      title: 'Product Manager',
    });
  });

  it('accepts either a role or a sufficiently detailed vacancy description', () => {
    expect(isManualInterviewSourceReady({ role: '', vacancyText: '' })).toBe(
      false
    );
    expect(
      isManualInterviewSourceReady({ role: 'PM', vacancyText: 'short' })
    ).toBe(false);
    expect(
      isManualInterviewSourceReady({
        role: '',
        vacancyText: 'Достаточно подробное описание вакансии.',
      })
    ).toBe(true);
    expect(isManualInterviewSourceReady({ role: 'PM', vacancyText: '' })).toBe(
      true
    );
    expect(
      isManualInterviewSourceReady({
        role: 'PM',
        vacancyText: 'Достаточно подробное описание роли.',
      })
    ).toBe(true);
  });

  it('clears profession state when the empty custom option is selected', () => {
    expect(
      resolveProfessionSelection({
        role: '',
        specialization: 'Начните вводить название прямо в поле',
        custom: true,
      })
    ).toEqual({
      role: '',
      specialization: '',
      selectedOption: null,
      keepPickerOpen: false,
      focusInput: true,
    });
  });

  it('uses typed custom profession without carrying over specialization', () => {
    const option = {
      role: 'DevRel',
      specialization: 'Своё название профессии',
      group: 'Своя профессия',
      custom: true,
    };

    expect(resolveProfessionSelection(option)).toEqual({
      role: 'DevRel',
      specialization: '',
      selectedOption: null,
      keepPickerOpen: false,
      focusInput: false,
    });
  });

  it('does not attach hidden specialization to prepared profession options', () => {
    const option = {
      role: 'Frontend-разработчик',
      specialization: '',
      group: 'IT',
    };

    expect(resolveProfessionSelection(option)).toEqual({
      role: 'Frontend-разработчик',
      specialization: '',
      selectedOption: option,
      keepPickerOpen: false,
      focusInput: false,
    });
  });
});
