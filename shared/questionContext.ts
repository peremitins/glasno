import type { InterviewFocus, InterviewLevel } from './dto';
import { PROFESSIONAL_ROLE_OPTIONS } from './professionalRoles';

export interface QuestionContext {
  roleKey: string;
  roleLabel: string;
  level: InterviewLevel;
  contextTags: string[];
  focus: InterviewFocus | null;
}

const CONTEXT_TAGS = [
  'vue',
  'react',
  'angular',
  'typescript',
  'javascript',
  'node.js',
  'nodejs',
  'python',
  'java',
  'go',
  'postgresql',
  'kubernetes',
  'docker',
  'swift',
  'kotlin',
  'flutter',
  'react native',
  'swiftui',
  'uikit',
  'objective-c',
  'jetpack compose',
  'c++',
  'c#',
  'rtos',
  'selenium',
  'playwright',
  'postman',
  'ci/cd',
  'aws',
  'terraform',
  'linux',
  'bash',
  'cisco',
  'bgp',
  'vpn',
  'tcp/ip',
  'owasp',
  'siem',
  'ml',
  'nlp',
  'llm',
  'rag',
  'etl',
  'spark',
  'airflow',
  'sql',
  'dwh',
  'power bi',
  'bpmn',
  'figma',
  'scrum',
  'kanban',
  'agile',
  'b2b',
  'b2c',
  'crm',
  'seo',
  'wms',
  '1с',
] as const;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е');
}

function fallbackRoleKey(role: string): string {
  const value = normalize(role)
    .replace(/[^a-z0-9а-я]+/giu, '-')
    .replace(/^-+|-+$/g, '');
  return value ? `role-${value}` : 'role-unknown';
}

export function resolveProfessionalRole(role: string): {
  roleKey: string;
  roleLabel: string;
} {
  const normalizedRole = normalize(role);
  const candidates = PROFESSIONAL_ROLE_OPTIONS.flatMap((option) =>
    [option.name, ...(option.aliases ?? [])].map((label) => ({
      id: option.id,
      name: option.name,
      label: normalize(label),
    }))
  ).sort((left, right) => {
    const leftSpecificity = left.id.startsWith('it-') ? 1000 : 0;
    const rightSpecificity = right.id.startsWith('it-') ? 1000 : 0;
    return rightSpecificity + right.label.length - (leftSpecificity + left.label.length);
  });
  const matched = candidates.find(
    (candidate) =>
      normalizedRole === candidate.label ||
      (candidate.label.length >= 3 && normalizedRole.includes(candidate.label))
  );

  return matched
    ? { roleKey: matched.id, roleLabel: matched.name }
    : { roleKey: fallbackRoleKey(role), roleLabel: role.trim() || 'Не указана' };
}

export function extractQuestionContextTags(value: string): string[] {
  const normalizedValue = normalize(value);
  const tags = CONTEXT_TAGS.filter((tag) => normalizedValue.includes(tag));
  return [...new Set(tags.map((tag) => (tag === 'nodejs' ? 'node.js' : tag)))];
}

export function buildQuestionContext(params: {
  role: string;
  level: InterviewLevel;
  specialization?: string | null;
  vacancyText?: string | null;
  focus?: InterviewFocus | null;
}): QuestionContext {
  const role = resolveProfessionalRole(params.role);
  return {
    ...role,
    level: params.level,
    contextTags: extractQuestionContextTags(
      [params.specialization, params.vacancyText].filter(Boolean).join(' ')
    ),
    focus: params.focus ?? null,
  };
}

export function matchesQuestionContext(
  preference: Pick<QuestionContext, 'roleKey' | 'level' | 'contextTags' | 'focus'>,
  interview: Pick<QuestionContext, 'roleKey' | 'level' | 'contextTags' | 'focus'>
): boolean {
  if (preference.roleKey !== interview.roleKey) return false;
  if (preference.level !== interview.level) return false;
  if (interview.focus && preference.focus && interview.focus !== preference.focus) {
    return false;
  }
  const availableTags = new Set(interview.contextTags.map(normalize));
  return preference.contextTags.every((tag) => availableTags.has(normalize(tag)));
}
