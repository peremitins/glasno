import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractHhVacancyId,
  prepareInterviewSource,
  stripHtmlToText,
} from './source';

describe('interview source preparation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('rejects unsupported sites before fetching the page', async () => {
    let fetchCalled = false;

    await expect(
      prepareInterviewSource(
        {
          type: 'hh_url',
          url: 'https://www.youtube.com/watch?v=bzz622DshiM',
        },
        {
          hhClient: null,
          fetchHtml: async () => {
            fetchCalled = true;
            return '<main><h1>Видео</h1><p>Длинное описание видео на YouTube.</p></main>';
          },
        }
      )
    ).rejects.toThrow('ссылка не поддерживается');

    expect(fetchCalled).toBe(false);
  });

  it('does not follow redirects to unsupported sites', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: {
          Location: 'https://www.youtube.com/watch?v=bzz622DshiM',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      prepareInterviewSource(
        {
          type: 'hh_url',
          url: 'https://jobs.lever.co/acme/product-manager-id',
        },
        { hhClient: null }
      )
    ).rejects.toThrow('ссылка не поддерживается');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('loads and normalizes a vacancy from a generic public page', async () => {
    const source = await prepareInterviewSource(
      {
        type: 'hh_url',
        url: 'https://jobs.lever.co/acme/product-manager-id',
      },
      {
        hhClient: null,
        fetchHtml: async (url: URL) => {
          expect(url.href).toBe(
            'https://jobs.lever.co/acme/product-manager-id'
          );
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
      vacancyUrl: 'https://jobs.lever.co/acme/product-manager-id',
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
        url: 'https://career.habr.com/vacancies/100500',
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
