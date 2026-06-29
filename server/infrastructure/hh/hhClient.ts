import { $fetch } from 'ofetch';
import { apiError } from '@/server/utils/errors';
import type { HhClient, HhVacancy } from '@/server/interface/hh';

interface HhVacancyResponse {
  id: string;
  name: string;
  alternate_url?: string;
  description?: string;
  employer?: { name?: string };
  key_skills?: Array<{ name?: string }>;
}

export class HhHttpClient implements HhClient {
  constructor(private readonly baseUrl: string) {}

  async getVacancy(id: string): Promise<HhVacancy> {
    try {
      const vacancy = await $fetch<HhVacancyResponse>(
        `${this.baseUrl.replace(/\/$/, '')}/vacancies/${id}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'JobAI/0.1 (interview trainer)',
          },
          timeout: 12_000,
        }
      );

      return {
        id: vacancy.id,
        title: vacancy.name,
        companyName: vacancy.employer?.name || null,
        alternateUrl: vacancy.alternate_url || null,
        descriptionHtml: vacancy.description || '',
        keySkills:
          vacancy.key_skills
            ?.map((skill) => skill.name?.trim())
            .filter((skill): skill is string => Boolean(skill)) ?? [],
      };
    } catch (err) {
      throw apiError('E_UPSTREAM', 'Не удалось загрузить вакансию с hh.ru', {
        vacancyId: id,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
