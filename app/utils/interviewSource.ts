import type { CreateInterviewSessionRequestInput } from '@/shared/dto';

type ManualInterviewSource = Extract<
  CreateInterviewSessionRequestInput['source'],
  { type: 'text' } | { type: 'profession' }
>;

interface ManualInterviewSourceInput {
  role: string;
  specialization?: string;
  vacancyText: string;
  vacancyTitle?: string;
}

export interface ProfessionSelectionOption {
  role: string;
  specialization?: string;
  group?: string;
  custom?: boolean;
}

export interface ProfessionSelectionResult {
  role: string;
  specialization: string;
  selectedOption: ProfessionSelectionOption | null;
  keepPickerOpen: boolean;
  focusInput: boolean;
}

// Классификация ввода в едином поле «Вакансия или роль» на главной:
// одно поле принимает ссылку, свободное описание или короткую должность.
export type QuickSourceKind = 'empty' | 'url' | 'text' | 'role';

// Нормализует ввод к URL, если он похож на ссылку (с протоколом или как
// «домен/путь»). Иначе — null. Используется и для UI-подсказки, и для сборки
// source перед отправкой, чтобы фронт и поле не расходились в трактовке.
export function normalizeVacancyUrl(value: string): string | null {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-zа-яё]{2,}(\/\S*)?$/iu.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null;
}

export function classifyQuickSource(value: string): QuickSourceKind {
  const trimmed = value.trim();
  if (!trimmed) return 'empty';
  if (normalizeVacancyUrl(trimmed)) return 'url';
  if (trimmed.length >= 40 || trimmed.includes('\n')) return 'text';
  return 'role';
}

export function isManualInterviewSourceReady(
  input: Pick<ManualInterviewSourceInput, 'role' | 'vacancyText'>
): boolean {
  const role = input.role.trim();
  const vacancyText = input.vacancyText.trim();
  if (vacancyText.length > 0 && vacancyText.length < 10) return false;
  return role.length >= 2 || vacancyText.length >= 10;
}

export function resolveProfessionSelection(
  option: ProfessionSelectionOption
): ProfessionSelectionResult {
  const role = option.role.trim();

  if (option.custom && !role) {
    return {
      role: '',
      specialization: '',
      selectedOption: null,
      keepPickerOpen: false,
      focusInput: true,
    };
  }

  if (option.custom) {
    return {
      role,
      specialization: '',
      selectedOption: null,
      keepPickerOpen: false,
      focusInput: false,
    };
  }

  return {
    role,
    specialization: '',
    selectedOption: option,
    keepPickerOpen: false,
    focusInput: false,
  };
}

export function buildManualInterviewSource(
  input: ManualInterviewSourceInput
): ManualInterviewSource {
  const role = input.role.trim();
  const specialization = input.specialization?.trim();
  const vacancyText = input.vacancyText.trim();
  const vacancyTitle = input.vacancyTitle?.trim();

  if (vacancyText.length >= 10) {
    return {
      type: 'text',
      text: vacancyText,
      title: vacancyTitle || role || undefined,
    };
  }

  return {
    type: 'profession',
    role,
    specialization: specialization || undefined,
  };
}
