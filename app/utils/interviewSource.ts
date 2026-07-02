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
  specialization: string;
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

export function isManualInterviewSourceReady(
  input: Pick<ManualInterviewSourceInput, 'role' | 'vacancyText'>
): boolean {
  const role = input.role.trim();
  const vacancyText = input.vacancyText.trim();
  return (
    role.length >= 2 && (vacancyText.length === 0 || vacancyText.length >= 10)
  );
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
    specialization: option.specialization.trim(),
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
      title: vacancyTitle || role,
    };
  }

  return {
    type: 'profession',
    role,
    specialization: specialization || undefined,
  };
}
