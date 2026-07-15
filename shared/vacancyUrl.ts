export const UNSUPPORTED_VACANCY_URL_MESSAGE =
  'Эта ссылка не поддерживается. Вставьте ссылку на вакансию с поддерживаемого сайта или добавьте описание вакансии вручную.';

export const INVALID_VACANCY_PAGE_MESSAGE =
  'По этой ссылке не удалось определить вакансию. Откройте страницу конкретной вакансии и скопируйте её адрес или добавьте описание вручную.';

interface VacancyProvider {
  name: string;
  domains: readonly string[];
  matches: (url: URL) => boolean;
}

const pathStartsWith = (...prefixes: string[]) => (url: URL): boolean =>
  prefixes.some(
    (prefix) =>
      url.pathname.toLowerCase().startsWith(prefix) &&
      url.pathname.length > prefix.length
  );

const pathMatches = (pattern: RegExp) => (url: URL): boolean =>
  pattern.test(url.pathname);

// Реестр содержит только страницы конкретных вакансий. Каталоги, статьи,
// профили и произвольные страницы на тех же доменах намеренно не принимаются.
export const VACANCY_PROVIDERS: readonly VacancyProvider[] = [
  {
    name: 'HeadHunter',
    domains: ['hh.ru'],
    matches: (url) =>
      /\/vacanc(?:y|ies)\/\d+/i.test(url.pathname) ||
      /^\d+$/.test(url.searchParams.get('vacancyId') || ''),
  },
  {
    name: 'SuperJob',
    domains: ['superjob.ru'],
    matches: pathStartsWith('/vakansii/'),
  },
  {
    name: 'Работа.ру',
    domains: ['rabota.ru'],
    matches: pathStartsWith('/vacancy/'),
  },
  {
    name: 'Зарплата.ру',
    domains: ['zarplata.ru'],
    matches: pathStartsWith('/vacancy/'),
  },
  {
    name: 'Работа России',
    domains: ['trudvsem.ru'],
    matches: pathStartsWith('/vacancy/card/'),
  },
  {
    name: 'Хабр Карьера',
    domains: ['career.habr.com'],
    matches: pathMatches(/^\/vacancies\/\d+/i),
  },
  {
    name: 'Авито Работа',
    domains: ['avito.ru'],
    matches: pathMatches(/\/vakansii\/.+_\d+\/?$/i),
  },
  {
    name: 'ГородРабот',
    domains: ['gorodrabot.ru'],
    matches: pathStartsWith('/vacancy/'),
  },
  {
    name: 'JobLab',
    domains: ['joblab.ru'],
    matches: pathStartsWith('/vacancy/'),
  },
  {
    name: 'GeekJob',
    domains: ['geekjob.ru'],
    matches: pathStartsWith('/vacancy/'),
  },
  {
    name: 'Getmatch',
    domains: ['getmatch.ru'],
    matches: pathStartsWith('/vacancies/'),
  },
  {
    name: 'Finder',
    domains: ['finder.work'],
    matches: pathStartsWith('/vacancies/'),
  },
  {
    name: 'LinkedIn',
    domains: ['linkedin.com'],
    matches: pathStartsWith('/jobs/view/'),
  },
  {
    name: 'Indeed',
    domains: ['indeed.com'],
    matches: (url) =>
      url.pathname.toLowerCase() === '/viewjob' &&
      Boolean(url.searchParams.get('jk')),
  },
  {
    name: 'Glassdoor',
    domains: [
      'glassdoor.com',
      'glassdoor.co.uk',
      'glassdoor.ca',
      'glassdoor.de',
      'glassdoor.fr',
      'glassdoor.nl',
      'glassdoor.com.au',
      'glassdoor.co.in',
    ],
    matches: pathStartsWith('/job-listing/'),
  },
  {
    name: 'ZipRecruiter',
    domains: ['ziprecruiter.com'],
    matches: pathStartsWith('/jobs/'),
  },
  {
    name: 'Monster',
    domains: ['monster.com', 'monster.co.uk', 'monster.de', 'monster.fr'],
    matches: pathStartsWith('/job-openings/'),
  },
  {
    name: 'CareerBuilder',
    domains: ['careerbuilder.com'],
    matches: pathStartsWith('/job/'),
  },
  {
    name: 'SimplyHired',
    domains: ['simplyhired.com'],
    matches: pathStartsWith('/job/'),
  },
  {
    name: 'Jooble',
    domains: ['jooble.org'],
    matches: pathStartsWith('/desc/'),
  },
  {
    name: 'Adzuna',
    domains: [
      'adzuna.com',
      'adzuna.co.uk',
      'adzuna.de',
      'adzuna.fr',
      'adzuna.com.au',
    ],
    matches: pathStartsWith('/details/'),
  },
  {
    name: 'Wellfound',
    domains: ['wellfound.com'],
    matches: pathStartsWith('/jobs/'),
  },
  {
    name: 'Built In',
    domains: ['builtin.com'],
    matches: pathStartsWith('/job/'),
  },
  {
    name: 'Dice',
    domains: ['dice.com'],
    matches: pathStartsWith('/job-detail/'),
  },
  {
    name: 'The Muse',
    domains: ['themuse.com'],
    matches: pathStartsWith('/jobs/'),
  },
  {
    name: 'Remote OK',
    domains: ['remoteok.com'],
    matches: pathStartsWith('/remote-jobs/'),
  },
  {
    name: 'We Work Remotely',
    domains: ['weworkremotely.com'],
    matches: pathStartsWith('/remote-jobs/'),
  },
  {
    name: 'Remotive',
    domains: ['remotive.com'],
    matches: pathStartsWith('/remote-jobs/'),
  },
  {
    name: 'FlexJobs',
    domains: ['flexjobs.com'],
    matches: pathStartsWith('/publicjobs/', '/remote-jobs/'),
  },
  {
    name: 'Reed',
    domains: ['reed.co.uk'],
    matches: pathStartsWith('/jobs/'),
  },
  {
    name: 'Totaljobs',
    domains: ['totaljobs.com'],
    matches: pathStartsWith('/job/'),
  },
  {
    name: 'StepStone',
    domains: [
      'stepstone.de',
      'stepstone.at',
      'stepstone.be',
      'stepstone.nl',
      'stepstone.fr',
    ],
    matches: pathStartsWith('/stellenangebote--', '/jobs/'),
  },
  {
    name: 'EURES',
    domains: ['eures.europa.eu'],
    matches: pathStartsWith('/eures/portal/jv-se/jv-details/'),
  },
  {
    name: 'SEEK',
    domains: ['seek.com.au', 'seek.co.nz'],
    matches: pathStartsWith('/job/'),
  },
  {
    name: 'Naukri',
    domains: ['naukri.com'],
    matches: pathStartsWith('/job-listings-'),
  },
  {
    name: 'JobStreet',
    domains: ['jobstreet.com'],
    matches: pathStartsWith('/job/'),
  },
  {
    name: 'Greenhouse',
    domains: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],
    matches: pathMatches(/^\/[^/]+\/jobs\/\d+/i),
  },
  {
    name: 'Lever',
    domains: ['jobs.lever.co'],
    matches: pathMatches(/^\/[^/]+\/[^/]+/i),
  },
  {
    name: 'Workable',
    domains: ['apply.workable.com'],
    matches: pathMatches(/^\/[^/]+\/j\/[^/]+/i),
  },
  {
    name: 'Ashby',
    domains: ['jobs.ashbyhq.com'],
    matches: pathMatches(/^\/[^/]+\/[^/]+/i),
  },
  {
    name: 'SmartRecruiters',
    domains: ['jobs.smartrecruiters.com'],
    matches: pathMatches(/^\/[^/]+\/[^/]+/i),
  },
  {
    name: 'Jobvite',
    domains: ['jobs.jobvite.com'],
    matches: pathMatches(/^\/[^/]+\/job\/[^/]+/i),
  },
  {
    name: 'Workday',
    domains: ['myworkdayjobs.com'],
    matches: pathMatches(/\/job\/[^/]+/i),
  },
  {
    name: 'Recruitee',
    domains: ['recruitee.com'],
    matches: pathStartsWith('/o/'),
  },
  {
    name: 'Teamtailor',
    domains: ['teamtailor.com'],
    matches: pathStartsWith('/jobs/'),
  },
];

function hostnameMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function getVacancyProvider(url: URL): VacancyProvider | null {
  if (url.protocol !== 'https:' || url.username || url.password) return null;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  return (
    VACANCY_PROVIDERS.find(
      (provider) =>
        provider.domains.some((domain) => hostnameMatches(hostname, domain)) &&
        provider.matches(url)
    ) || null
  );
}

export type VacancyUrlValidation =
  | { ok: true; provider: string }
  | { ok: false; message: string };

export function validateVacancyUrl(rawUrl: string): VacancyUrlValidation {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, message: INVALID_VACANCY_PAGE_MESSAGE };
  }

  const provider = getVacancyProvider(url);
  if (!provider) {
    return { ok: false, message: UNSUPPORTED_VACANCY_URL_MESSAGE };
  }

  return { ok: true, provider: provider.name };
}

export function isSupportedVacancyUrl(rawUrl: string): boolean {
  return validateVacancyUrl(rawUrl).ok;
}
