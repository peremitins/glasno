import type { InterviewSource } from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import type { HhClient } from '@/server/interface/hh';

const MAX_VACANCY_CONTEXT_CHARS = 12_000;
const MAX_GENERIC_VACANCY_HTML_BYTES = 1_000_000;
const GENERIC_VACANCY_FETCH_TIMEOUT_MS = 12_000;

const ENTITY_MAP: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export interface PreparedInterviewSource {
  source: InterviewSource['type'];
  vacancyTitle: string | null;
  vacancyRaw: string | null;
  vacancyUrl: string | null;
  companyName: string | null;
  role: string | null;
}

export type GenericVacancyHtmlFetcher = (url: URL) => Promise<string>;

export function extractHhVacancyId(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw apiError('E_VALIDATION', 'Нужна корректная ссылка на вакансию hh.ru');
  }

  const host = url.hostname.toLowerCase();
  const isHhHost = host === 'hh.ru' || host.endsWith('.hh.ru');
  if (!isHhHost) {
    throw apiError('E_VALIDATION', 'Поддерживаются только ссылки на hh.ru');
  }

  const pathMatch = url.pathname.match(/\/vacanc(?:y|ies)\/(\d+)/);
  const queryId = url.searchParams.get('vacancyId');
  const id = pathMatch?.[1] || queryId || '';
  if (!/^\d+$/.test(id)) {
    throw apiError('E_VALIDATION', 'Не удалось найти id вакансии hh.ru');
  }

  return id;
}

function parseUrl(rawUrl: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    throw apiError('E_VALIDATION', 'Вставьте корректную ссылку на вакансию');
  }
}

function isHhUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host === 'hh.ru' || host.endsWith('.hh.ru');
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '0.0.0.0' ||
    normalized === '::1'
  ) {
    return true;
  }

  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, aRaw, bRaw] = ipv4;
    const a = Number(aRaw);
    const b = Number(bRaw);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  return (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function parsePublicVacancyUrl(rawUrl: string): URL {
  const url = parseUrl(rawUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw apiError('E_VALIDATION', 'Вставьте публичную ссылку на вакансию');
  }
  if (url.username || url.password || isLocalOrPrivateHostname(url.hostname)) {
    throw apiError('E_VALIDATION', 'Вставьте публичную ссылку на вакансию');
  }
  return url;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#\d+|#x[a-f0-9]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase();
    if (normalized.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    }
    if (normalized.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    }
    return ENTITY_MAP[normalized] ?? match;
  });
}

export function stripHtmlToText(html: string): string {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|section|article)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function removeNoisyHtmlBlocks(html: string): string {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ');
}

function extractTagText(html: string, tagName: string): string | null {
  const match = html.match(
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  );
  const text = match?.[1] ? stripHtmlToText(match[1]) : '';
  return text || null;
}

function extractMainHtml(html: string): string {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main?.[1]) return main[1];

  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return body?.[1] || html;
}

function trimContextText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, maxChars).trimEnd();
}

function extractGenericVacancyPage(html: string): {
  title: string | null;
  text: string;
} {
  const cleanedHtml = removeNoisyHtmlBlocks(html);
  const title =
    extractTagText(cleanedHtml, 'h1') || extractTagText(cleanedHtml, 'title');
  const text = trimContextText(
    stripHtmlToText(extractMainHtml(cleanedHtml)),
    MAX_VACANCY_CONTEXT_CHARS
  );

  if (text.length < 20) {
    throw apiError(
      'E_UPSTREAM',
      'Не получилось прочитать вакансию по этой ссылке. Скопируйте описание вакансии во вкладку «Текст вакансии».'
    );
  }

  return { title, text };
}

async function fetchGenericVacancyHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    GENERIC_VACANCY_FETCH_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('text/plain') &&
      !contentType.includes('application/xhtml+xml')
    ) {
      throw new Error(`Unsupported content-type ${contentType}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (receivedBytes >= MAX_GENERIC_VACANCY_HTML_BYTES) {
        await reader.cancel();
        break;
      }
    }

    html += decoder.decode();
    return html;
  } catch (err) {
    throw apiError(
      'E_UPSTREAM',
      'Не получилось прочитать вакансию по этой ссылке. Сайт может закрывать доступ или страница требует входа. Скопируйте описание вакансии во вкладку «Текст вакансии».',
      {
        url: url.href,
        cause: err instanceof Error ? err.message : String(err),
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function prepareInterviewSource(
  source: InterviewSource,
  deps: { hhClient: HhClient | null; fetchHtml?: GenericVacancyHtmlFetcher }
): Promise<PreparedInterviewSource> {
  if (source.type === 'hh_url') {
    const url = parsePublicVacancyUrl(source.url);

    if (!isHhUrl(url)) {
      const html = await (deps.fetchHtml || fetchGenericVacancyHtml)(url);
      const vacancy = extractGenericVacancyPage(html);
      return {
        source: 'hh_url',
        vacancyTitle: vacancy.title,
        vacancyRaw: vacancy.text,
        vacancyUrl: url.href,
        companyName: null,
        role: vacancy.title,
      };
    }

    if (!deps.hhClient) {
      throw apiError('E_UPSTREAM', 'HH API не настроен');
    }
    const vacancyId = extractHhVacancyId(source.url);
    const vacancy = await deps.hhClient.getVacancy(vacancyId);
    const description = stripHtmlToText(vacancy.descriptionHtml);
    const skills = vacancy.keySkills.length
      ? ` Навыки: ${vacancy.keySkills.join(', ')}`
      : '';

    return {
      source: 'hh_url',
      vacancyTitle: vacancy.title,
      vacancyRaw: trimContextText(
        `${description}${skills}`.trim(),
        MAX_VACANCY_CONTEXT_CHARS
      ),
      vacancyUrl: vacancy.alternateUrl || source.url,
      companyName: vacancy.companyName,
      role: vacancy.title,
    };
  }

  if (source.type === 'text') {
    return {
      source: 'text',
      vacancyTitle: source.title || null,
      vacancyRaw: trimContextText(source.text, MAX_VACANCY_CONTEXT_CHARS),
      vacancyUrl: null,
      companyName: null,
      role: source.title || null,
    };
  }

  const specialization = source.specialization
    ? `, специализация: ${source.specialization.trim()}`
    : '';

  return {
    source: 'profession',
    vacancyTitle: null,
    vacancyRaw: `Профессия: ${source.role.trim()}${specialization}`,
    vacancyUrl: null,
    companyName: null,
    role: source.role.trim(),
  };
}
