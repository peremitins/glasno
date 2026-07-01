import { $fetch } from 'ofetch';
import { apiError } from '@/server/utils/errors';
import type { HhClient, HhVacancy } from '@/server/interface/hh';

const HH_USER_AGENT = 'JobAI/0.1 (interview trainer)';
const HH_WEB_BASE_URL = 'https://hh.ru';

interface HhHttpClientOptions {
  accessToken?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  authBaseUrl?: string;
  allowHtmlFallback?: boolean;
}

interface HhVacancyResponse {
  id: string;
  name: string;
  alternate_url?: string;
  description?: string;
  employer?: { name?: string };
  key_skills?: Array<{ name?: string }>;
}

interface HhTokenResponse {
  access_token?: string;
}

interface HhVacancyJsonLd {
  '@type'?: string | string[];
  title?: unknown;
  description?: unknown;
  hiringOrganization?: unknown;
}

interface OrganizationJsonLd {
  name?: unknown;
}

function getFetchStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;

  const error = err as {
    response?: { status?: unknown };
    status?: unknown;
    statusCode?: unknown;
  };
  const status = error.response?.status ?? error.status ?? error.statusCode;

  return typeof status === 'number' ? status : null;
}

function decodeHtmlEntities(value: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  return value.replace(/&(#\d+|#x[a-f0-9]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase();
    if (normalized.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    }
    if (normalized.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    }
    return entities[normalized] ?? match;
  });
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeJsonLdItems(value: unknown): HhVacancyJsonLd[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeJsonLdItems(item));
  }
  if (!value || typeof value !== 'object') {
    return [];
  }

  const object = value as HhVacancyJsonLd & { '@graph'?: unknown };
  return [object, ...normalizeJsonLdItems(object['@graph'])];
}

function isJobPosting(item: HhVacancyJsonLd): boolean {
  const type = item['@type'];
  return Array.isArray(type)
    ? type.includes('JobPosting')
    : type === 'JobPosting';
}

function extractJsonLdVacancy(html: string): HhVacancyJsonLd | null {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1].trim());
      const vacancy = normalizeJsonLdItems(parsed).find(isJobPosting);
      if (vacancy) return vacancy;
    } catch {
      continue;
    }
  }

  return null;
}

function extractHtmlAttribute(
  html: string,
  tagPattern: RegExp,
  attribute: string
): string | null {
  const tag = html.match(tagPattern)?.[0];
  if (!tag) return null;

  const attributeMatch = tag.match(
    new RegExp(`${attribute}=["']([^"']+)["']`, 'i')
  );
  return attributeMatch?.[1] ? decodeHtmlEntities(attributeMatch[1]) : null;
}

function extractTitleFallback(html: string): string {
  const h1 = html.match(
    /<h1[^>]*data-qa=["']vacancy-title["'][^>]*>([\s\S]*?)<\/h1>/i
  );
  if (h1?.[1]) return stripTags(h1[1]);

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title?.[1] ? stripTags(title[1]) : '';
}

export class HhHttpClient implements HhClient {
  private accessToken: string | null;
  private readonly clientId: string | null;
  private readonly clientSecret: string | null;
  private readonly authBaseUrl: string;
  private readonly allowHtmlFallback: boolean;

  constructor(
    private readonly baseUrl: string,
    options: HhHttpClientOptions = {}
  ) {
    this.accessToken = options.accessToken?.trim() || null;
    this.clientId = options.clientId?.trim() || null;
    this.clientSecret = options.clientSecret?.trim() || null;
    this.authBaseUrl = options.authBaseUrl?.replace(/\/$/, '') || HH_WEB_BASE_URL;
    this.allowHtmlFallback = options.allowHtmlFallback ?? true;
  }

  async getVacancy(id: string): Promise<HhVacancy> {
    const apiUrl = `${this.baseUrl.replace(/\/$/, '')}/vacancies/${id}`;

    try {
      const token = await this.getAccessToken();
      const vacancy = await $fetch<HhVacancyResponse>(apiUrl, {
        headers: {
          Accept: 'application/json',
          'HH-User-Agent': HH_USER_AGENT,
          'User-Agent': HH_USER_AGENT,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 12_000,
      });

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
      if (
        this.allowHtmlFallback &&
        !this.hasConfiguredAuthorization() &&
        getFetchStatus(err) === 403
      ) {
        return this.getVacancyFromPublicPage(id, err);
      }

      throw apiError('E_UPSTREAM', 'Не удалось загрузить вакансию с hh.ru', {
        vacancyId: id,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private hasConfiguredAuthorization(): boolean {
    return Boolean(this.accessToken || (this.clientId && this.clientSecret));
  }

  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken) {
      return this.accessToken;
    }
    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const response = await $fetch<HhTokenResponse>(`${this.authBaseUrl}/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'HH-User-Agent': HH_USER_AGENT,
        'User-Agent': HH_USER_AGENT,
      },
      body,
      timeout: 12_000,
    });

    if (!response.access_token?.trim()) {
      throw new Error('HH did not return application access_token');
    }

    this.accessToken = response.access_token.trim();
    return this.accessToken;
  }

  private async getVacancyFromPublicPage(
    id: string,
    apiErrorCause: unknown
  ): Promise<HhVacancy> {
    const publicUrl = `${HH_WEB_BASE_URL}/vacancy/${id}`;

    try {
      const html = await $fetch<string>(publicUrl, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
        timeout: 12_000,
      });
      const vacancy = extractJsonLdVacancy(html);
      const organization = Array.isArray(vacancy?.hiringOrganization)
        ? vacancy?.hiringOrganization[0]
        : vacancy?.hiringOrganization;
      const organizationName =
        organization && typeof organization === 'object'
          ? (organization as OrganizationJsonLd).name
          : null;
      const title =
        typeof vacancy?.title === 'string'
          ? vacancy.title.trim()
          : extractTitleFallback(html);
      const descriptionHtml =
        typeof vacancy?.description === 'string' ? vacancy.description : '';
      const alternateUrl = extractHtmlAttribute(
        html,
        /<link[^>]+rel=["']canonical["'][^>]*>/i,
        'href'
      );

      if (!title || !descriptionHtml) {
        throw new Error('HH vacancy page does not contain JobPosting JSON-LD');
      }

      return {
        id,
        title,
        companyName:
          typeof organizationName === 'string' && organizationName.trim()
            ? organizationName.trim()
            : null,
        alternateUrl,
        descriptionHtml,
        keySkills: [],
      };
    } catch (fallbackErr) {
      throw apiError('E_UPSTREAM', 'Не удалось загрузить вакансию с hh.ru', {
        vacancyId: id,
        cause:
          apiErrorCause instanceof Error
            ? apiErrorCause.message
            : String(apiErrorCause),
        fallbackCause:
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr),
      });
    }
  }
}
