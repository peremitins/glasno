import type { InterviewSource } from '@/shared/dto';
import { apiError } from '@/server/utils/errors';
import type { HhClient } from '@/server/interface/hh';

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

export async function prepareInterviewSource(
  source: InterviewSource,
  deps: { hhClient: HhClient | null }
): Promise<PreparedInterviewSource> {
  if (source.type === 'hh_url') {
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
      vacancyRaw: `${description}${skills}`.trim(),
      vacancyUrl: vacancy.alternateUrl || source.url,
      companyName: vacancy.companyName,
      role: vacancy.title,
    };
  }

  if (source.type === 'text') {
    return {
      source: 'text',
      vacancyTitle: source.title || null,
      vacancyRaw: source.text.trim(),
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
