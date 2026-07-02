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

  it('loads and normalizes a vacancy from a generic public page', async () => {
    const source = await prepareInterviewSource(
      {
        type: 'hh_url',
        url: 'https://jobs.example.com/product-manager',
      },
      {
        hhClient: null,
        fetchHtml: async (url: URL) => {
          expect(url.href).toBe('https://jobs.example.com/product-manager');
          return `
            <html>
              <head>
                <title>Product Manager в FinTech</title>
              </head>
              <body>
                <nav>Главное меню</nav>
                <main>
                  <h1>Product Manager</h1>
                  <p>Задачи: discovery, roadmap, запуск B2B-продуктов.</p>
                  <p>Требования: метрики, интервью с клиентами, финансы.</p>
                </main>
                <script>window.__data = "ignore me"</script>
              </body>
            </html>
          `;
        },
      }
    );

    expect(source).toMatchObject({
      source: 'hh_url',
      vacancyTitle: 'Product Manager',
      vacancyUrl: 'https://jobs.example.com/product-manager',
      role: 'Product Manager',
      companyName: null,
    });
    expect(source.vacancyRaw).toContain('discovery, roadmap');
    expect(source.vacancyRaw).not.toContain('Главное меню');
    expect(source.vacancyRaw).not.toContain('ignore me');
  });

  it('truncates extracted vacancy text before it becomes interview context', async () => {
    const source = await prepareInterviewSource(
      {
        type: 'hh_url',
        url: 'https://jobs.example.com/huge-vacancy',
      },
      {
        hhClient: null,
        fetchHtml: async () =>
          `<main><h1>Большая вакансия</h1><p>${'очень подробное описание '.repeat(
            900
          )}</p></main>`,
      }
    );

    expect(source.vacancyRaw?.length).toBeLessThanOrEqual(12_000);
  });

  it('rejects local URLs before fetching generic vacancy pages', async () => {
    await expect(
      prepareInterviewSource(
        {
          type: 'hh_url',
          url: 'http://localhost:3000/vacancy',
        },
        {
          hhClient: null,
          fetchHtml: async () => {
            throw new Error('should not fetch local URLs');
          },
        }
      )
    ).rejects.toThrow('публичную ссылку');

    await expect(
      prepareInterviewSource(
        {
          type: 'hh_url',
          url: 'http://[::1]/vacancy',
        },
        {
          hhClient: null,
          fetchHtml: async () => {
            throw new Error('should not fetch local URLs');
          },
        }
      )
    ).rejects.toThrow('публичную ссылку');
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
