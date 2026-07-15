import { describe, expect, it } from 'vitest';
import {
  getVacancyProvider,
  validateVacancyUrl,
} from './vacancyUrl';

describe('vacancy URL validation', () => {
  it.each([
    ['HeadHunter', 'https://spb.hh.ru/vacancy/123456'],
    ['SuperJob', 'https://www.superjob.ru/vakansii/product-manager-123.html'],
    ['Работа.ру', 'https://moscow.rabota.ru/vacancy/123456'],
    ['Зарплата.ру', 'https://zarplata.ru/vacancy/123456'],
    ['Работа России', 'https://trudvsem.ru/vacancy/card/123456'],
    ['Хабр Карьера', 'https://career.habr.com/vacancies/100500'],
    [
      'Авито Работа',
      'https://www.avito.ru/moskva/vakansii/product_manager_123456',
    ],
    ['ГородРабот', 'https://gorodrabot.ru/vacancy/123456'],
    ['JobLab', 'https://joblab.ru/vacancy/123456'],
    ['GeekJob', 'https://geekjob.ru/vacancy/123456'],
    ['Getmatch', 'https://getmatch.ru/vacancies/123456'],
    ['Finder', 'https://finder.work/vacancies/123456'],
    ['LinkedIn', 'https://www.linkedin.com/jobs/view/123456789'],
    ['Indeed', 'https://uk.indeed.com/viewjob?jk=abcdef123456'],
    ['Glassdoor', 'https://glassdoor.com/job-listing/product-manager-123'],
    ['ZipRecruiter', 'https://ziprecruiter.com/jobs/acme/product-manager'],
    ['Monster', 'https://monster.com/job-openings/product-manager-moscow'],
    ['CareerBuilder', 'https://careerbuilder.com/job/J123456'],
    ['SimplyHired', 'https://simplyhired.com/job/abcdef'],
    ['Jooble', 'https://ru.jooble.org/desc/123456'],
    ['Adzuna', 'https://adzuna.com/details/123456'],
    ['Wellfound', 'https://wellfound.com/jobs/123456-product-manager'],
    ['Built In', 'https://builtin.com/job/product/product-manager/123456'],
    ['Dice', 'https://dice.com/job-detail/123456'],
    ['The Muse', 'https://themuse.com/jobs/acme/product-manager'],
    ['Remote OK', 'https://remoteok.com/remote-jobs/123456-product-manager'],
    [
      'We Work Remotely',
      'https://weworkremotely.com/remote-jobs/acme-product-manager',
    ],
    ['Remotive', 'https://remotive.com/remote-jobs/product/product-manager-123'],
    ['FlexJobs', 'https://flexjobs.com/publicjobs/product-manager-123'],
    ['Reed', 'https://reed.co.uk/jobs/product-manager/123456'],
    ['Totaljobs', 'https://totaljobs.com/job/product-manager/acme-job123'],
    ['StepStone', 'https://stepstone.de/jobs/product-manager'],
    [
      'EURES',
      'https://eures.europa.eu/eures/portal/jv-se/jv-details/123456',
    ],
    ['SEEK', 'https://seek.com.au/job/123456'],
    ['Naukri', 'https://naukri.com/job-listings-product-manager-acme-123'],
    ['JobStreet', 'https://jobstreet.com/job/123456'],
    ['Greenhouse', 'https://boards.greenhouse.io/acme/jobs/123456'],
    ['Lever', 'https://jobs.lever.co/acme/1234-abcd'],
    ['Workable', 'https://apply.workable.com/acme/j/ABC123/'],
    ['Ashby', 'https://jobs.ashbyhq.com/acme/1234-abcd'],
    [
      'SmartRecruiters',
      'https://jobs.smartrecruiters.com/Acme/123-product-manager',
    ],
    ['Jobvite', 'https://jobs.jobvite.com/acme/job/abc123'],
    [
      'Workday',
      'https://acme.wd5.myworkdayjobs.com/en-US/careers/job/Moscow/Product-Manager_R123',
    ],
    ['Recruitee', 'https://acme.recruitee.com/o/product-manager'],
    ['Teamtailor', 'https://acme.teamtailor.com/jobs/123-product-manager'],
  ])('accepts %s vacancy links', (provider, url) => {
    expect(validateVacancyUrl(url)).toEqual({ ok: true, provider });
    expect(getVacancyProvider(new URL(url))?.name).toBe(provider);
  });

  it.each([
    'https://www.youtube.com/watch?v=bzz622DshiM',
    'https://fake-hh.ru/vacancy/123456',
    'https://hh.ru.evil.example/vacancy/123456',
    'https://hh.ru/article/28',
    'https://www.linkedin.com/in/example-person',
    'https://prosto.rabota.ru/news/example',
    'http://career.habr.com/vacancies/100500',
  ])('rejects non-vacancy URL %s', (url) => {
    expect(validateVacancyUrl(url).ok).toBe(false);
  });
});
