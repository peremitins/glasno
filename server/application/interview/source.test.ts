import { describe, expect, it } from 'vitest';
import {
  extractHhVacancyId,
  prepareInterviewSource,
  stripHtmlToText,
} from './source';

describe('interview source preparation', () => {
  it('extracts vacancy ids from common hh.ru URLs', () => {
    expect(extractHhVacancyId('https://hh.ru/vacancy/123456?from=main')).toBe(
      '123456'
    );
    expect(extractHhVacancyId('https://api.hh.ru/vacancies/987654')).toBe(
      '987654'
    );
    expect(
      extractHhVacancyId('https://spb.hh.ru/vacancy/111222?query=manager')
    ).toBe('111222');
  });

  it('rejects non-hh URLs as vacancy sources', () => {
    expect(() => extractHhVacancyId('https://example.com/vacancy/123')).toThrow(
      'hh.ru'
    );
  });

  it('converts vacancy html into readable plain text', () => {
    expect(
      stripHtmlToText(
        '<p>Опыт&nbsp;работы с клиентами</p><ul><li>CRM</li><li>переговоры</li></ul>'
      )
    ).toBe('Опыт работы с клиентами CRM переговоры');
  });

  it('loads and normalizes a vacancy from the HH provider', async () => {
    const source = await prepareInterviewSource(
      {
        type: 'hh_url',
        url: 'https://hh.ru/vacancy/7654321',
      },
      {
        hhClient: {
          async getVacancy(id) {
            expect(id).toBe('7654321');
            return {
              id,
              title: 'Руководитель отдела продаж',
              companyName: 'Ромашка',
              alternateUrl: 'https://hh.ru/vacancy/7654321',
              descriptionHtml:
                '<p>Нужно вести команду продаж и работать с CRM.</p>',
              keySkills: ['B2B', 'CRM'],
            };
          },
        },
      }
    );

    expect(source).toMatchObject({
      source: 'hh_url',
      vacancyTitle: 'Руководитель отдела продаж',
      companyName: 'Ромашка',
      vacancyUrl: 'https://hh.ru/vacancy/7654321',
      vacancyRaw: 'Нужно вести команду продаж и работать с CRM. Навыки: B2B, CRM',
    });
  });
});
