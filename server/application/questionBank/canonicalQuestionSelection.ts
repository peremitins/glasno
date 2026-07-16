import type { QuestionPreferenceStatus } from '@/shared/dto';
import type {
  CanonicalQuestionRecord,
  CanonicalQuestionSelectionContext,
} from '@/server/interface/canonicalQuestionRepository';

interface ConceptPreference {
  conceptKey: string;
  status: QuestionPreferenceStatus;
}

const FRAMEWORKS = ['react', 'vue', 'angular'] as const;

export function selectCanonicalQuestions(params: {
  candidates: CanonicalQuestionRecord[];
  context: CanonicalQuestionSelectionContext;
  preferences: ConceptPreference[];
  previouslySelectedCanonicalQuestionIds?: readonly string[];
  count: number;
}): CanonicalQuestionRecord[] {
  if (params.count <= 0 || params.context.roleKey !== 'it-frontend') return [];

  const selectedFrameworks = FRAMEWORKS.filter((framework) =>
    params.context.contextTags.includes(framework)
  );
  const excludedConcepts = new Set(
    params.preferences.map((preference) => preference.conceptKey)
  );
  const candidates = params.candidates.filter((candidate) => {
      if (candidate.roleKey !== params.context.roleKey) return false;
      if (candidate.seniority !== params.context.level) return false;
      if (excludedConcepts.has(candidate.corpusId)) return false;
      if (
        candidate.framework !== 'none' &&
        !selectedFrameworks.includes(
          candidate.framework as (typeof FRAMEWORKS)[number]
        )
      ) {
        return false;
      }
      return matchesFocus(candidate.interviewType, params.context.focus);
    });
  const previouslySelected = new Set(
    params.previouslySelectedCanonicalQuestionIds ?? []
  );
  const orderedCandidates = orderByStack(candidates, selectedFrameworks);
  const unselected = orderedCandidates.filter(
    (candidate) => !wasPreviouslySelected(candidate, previouslySelected)
  );
  const cycleStart = orderedCandidates.filter((candidate) =>
    wasPreviouslySelected(candidate, previouslySelected)
  );

  return [...unselected, ...cycleStart].slice(0, params.count);
}

function wasPreviouslySelected(
  candidate: CanonicalQuestionRecord,
  previouslySelected: Set<string>
) {
  return (
    previouslySelected.has(candidate.id) ||
    previouslySelected.has(candidate.corpusId)
  );
}

function matchesFocus(
  interviewType: CanonicalQuestionRecord['interviewType'],
  focus: CanonicalQuestionSelectionContext['focus']
) {
  if (focus === 'behavioral') return interviewType === 'behavioral';
  if (focus === 'hr_screening' || focus === 'salary_negotiation') return false;
  return interviewType !== 'behavioral';
}

function orderByStack(
  candidates: CanonicalQuestionRecord[],
  frameworks: readonly (typeof FRAMEWORKS)[number][]
) {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (left, right) =>
        stackOrder(left.candidate.framework, frameworks) -
          stackOrder(right.candidate.framework, frameworks) ||
        left.index - right.index
    )
    .map(({ candidate }) => candidate);
}

function stackOrder(
  framework: CanonicalQuestionRecord['framework'],
  frameworks: readonly (typeof FRAMEWORKS)[number][]
) {
  if (framework === 'none') return frameworks.length;
  const index = frameworks.indexOf(framework as (typeof FRAMEWORKS)[number]);
  return index === -1 ? frameworks.length + 1 : index;
}
