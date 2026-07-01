import { beforeEach, describe, expect, it, vi } from 'vitest';
import { $fetch } from 'ofetch';
import { HhHttpClient } from './hhClient';

vi.mock('ofetch', () => ({
  $fetch: vi.fn(),
}));

const mockedFetch = vi.mocked($fetch);

describe('HhHttpClient', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('passes a configured application token to the vacancy API', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: '134186766',
      name: 'Senior Frontend Developer',
      alternate_url: 'https://hh.ru/vacancy/134186766',
      description: '<p>Vue and Nuxt.</p>',
      employer: { name: 'Selecty' },
      key_skills: [{ name: 'Vue' }],
    });

    const vacancy = await new HhHttpClient('https://api.hh.ru', {
      accessToken: 'hh-app-token',
    }).getVacancy('134186766');

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenNthCalledWith(
      1,
      'https://api.hh.ru/vacancies/134186766',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer hh-app-token',
        }),
      })
    );
    expect(vacancy.companyName).toBe('Selecty');
  });

  it('gets an application token with client credentials before loading a vacancy', async () => {
    mockedFetch
      .mockResolvedValueOnce({
        access_token: 'generated-app-token',
      })
      .mockResolvedValueOnce({
        id: '134186766',
        name: 'Senior Frontend Developer',
        description: '<p>Vue and Nuxt.</p>',
        key_skills: [],
      });

    await new HhHttpClient('https://api.hh.ru', {
      clientId: 'client-id',
      clientSecret: 'client-secret',
    }).getVacancy('134186766');

    expect(mockedFetch).toHaveBeenNthCalledWith(
      1,
      'https://hh.ru/token',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams),
      })
    );
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.hh.ru/vacancies/134186766',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer generated-app-token',
        }),
      })
    );
  });

  it('does not fall back to the public vacancy page when API authorization is configured', async () => {
    mockedFetch.mockRejectedValueOnce(
      Object.assign(new Error('[GET] "https://api.hh.ru/vacancies/134186766": 403 Forbidden'), {
        response: { status: 403 },
      })
    );

    await expect(
      new HhHttpClient('https://api.hh.ru', {
        accessToken: 'hh-app-token',
      }).getVacancy('134186766')
    ).rejects.toThrow('Не удалось загрузить вакансию с hh.ru');
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the public vacancy page when the HH API returns 403', async () => {
    mockedFetch
      .mockRejectedValueOnce(
        Object.assign(new Error('[GET] "https://api.hh.ru/vacancies/134186766": 403 Forbidden'), {
          response: { status: 403 },
        })
      )
      .mockResolvedValueOnce(`
        <html>
          <head>
            <link rel="canonical" href="https://krasnodar.hh.ru/vacancy/134186766">
            <script type="application/ld+json">
              {
                "@context": "https://schema.org/",
                "@type": "JobPosting",
                "title": "Senior Frontend Developer (Vue.js / Nuxt.js)",
                "description": "<p>Разработка и поддержка фронтенд-приложений.</p>",
                "hiringOrganization": {
                  "@type": "Organization",
                  "name": "Selecty"
                }
              }
            </script>
          </head>
        </html>
      `);

    const vacancy = await new HhHttpClient('https://api.hh.ru').getVacancy(
      '134186766'
    );

    expect(mockedFetch).toHaveBeenNthCalledWith(
      1,
      'https://api.hh.ru/vacancies/134186766',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      })
    );
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      'https://hh.ru/vacancy/134186766',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'text/html,application/xhtml+xml',
        }),
      })
    );
    expect(vacancy).toEqual({
      id: '134186766',
      title: 'Senior Frontend Developer (Vue.js / Nuxt.js)',
      companyName: 'Selecty',
      alternateUrl: 'https://krasnodar.hh.ru/vacancy/134186766',
      descriptionHtml: '<p>Разработка и поддержка фронтенд-приложений.</p>',
      keySkills: [],
    });
  });
});
