<script setup lang="ts">
  import {
    ArrowRightIcon,
    CheckIcon,
    ChevronDownIcon,
    Cross2Icon,
    CubeIcon,
    FileTextIcon,
    Link2Icon,
    LockClosedIcon,
    QuestionMarkCircledIcon,
  } from '@radix-icons/vue';
  import {
    computed,
    nextTick,
    onBeforeUnmount,
    reactive,
    ref,
    watch,
    type Component,
  } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    ComboboxAnchor,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxPortal,
    ComboboxRoot,
    ComboboxViewport,
  } from 'reka-ui';
  import type {
    CreateInterviewSessionRequest,
    CreateInterviewSessionRequestInput,
    InterviewerAvatarId,
    InterviewStateResponse,
    QuestionInputExtractResponse,
    ResumeExtractResponse,
  } from '@/shared/dto';
  import { PROFESSIONAL_ROLE_OPTIONS } from '@/shared/professionalRoles';
  import { getRoleContextTags } from '@/app/utils/roleContextTags';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import VoiceTextarea from '@/app/components/form/VoiceTextarea.vue';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import PaywallModal from '@/app/components/billing/PaywallModal.vue';
  import {
    buildManualInterviewSource,
    isManualInterviewSourceReady,
    resolveProfessionSelection,
  } from '@/app/utils/interviewSource';
  import { buildResumePreviewBlocks } from '@/app/utils/resumePreview';
  import { sanitizeProviderErrorMessage } from '@/app/utils/providerErrorMessage';

  type SourceMode = 'hh_url' | 'manual';
  type InterviewLevel = CreateInterviewSessionRequest['level'];
  type InterviewerMode = CreateInterviewSessionRequest['interviewerMode'];
  type InterviewSessionGoal = CreateInterviewSessionRequest['sessionGoal'];
  type TrainingMode = CreateInterviewSessionRequest['trainingMode'];
  type CandidatePersona = CreateInterviewSessionRequest['candidatePersona'];
  type CandidateDifficulty =
    CreateInterviewSessionRequest['candidateDifficulty'];
  type QuestionSourceMode = NonNullable<
    CreateInterviewSessionRequest['questionSourceMode']
  >;
  type InterviewFocus = NonNullable<CreateInterviewSessionRequest['focus']>;

  interface RoleOption {
    role: string;
    specialization: string;
    group: string;
    aliases?: string[];
    custom?: boolean;
  }

  const MAX_RESUME_CONTEXT_CHARS = 15_000;
  const MAX_VISIBLE_ROLE_OPTIONS = 64;

  const { t } = useI18n();
  const route = useRoute();
  const api = useAPI();
  const billing = useBillingStatus();

  onMounted(() => {
    void billing.ensureLoaded();
  });

  // Все форматы интервью в порядке возрастания длительности. Отдельная
  // константа (не sessionGoalOptions.map) — иначе watch ниже дёргает getter
  // до инициализации sessionGoalOptions и падает с TDZ-ошибкой.
  const SESSION_GOAL_VALUES: InterviewSessionGoal[] = [
    'quick',
    'standard',
    'deep',
  ];

  // Форматы, недоступные без активного пропуска (Free — только «Быстро»).
  // Пока статус не загружен — считаем всё доступным: превентивная блокировка,
  // финальную проверку делает бэкенд (assertCanCreateInterview).
  const lockedSessionGoals = computed<InterviewSessionGoal[]>(() => {
    const status = billing.status.value;
    if (!status || status.unlimited) return [];
    return SESSION_GOAL_VALUES.filter(
      (goal) => !status.allowedSessionGoals.includes(goal)
    );
  });

  function isSessionGoalLocked(goal: InterviewSessionGoal): boolean {
    return lockedSessionGoals.value.includes(goal);
  }

  const paywallOpen = ref(false);

  // Бесплатная попытка исчерпана и активного пропуска нет: запуск любого
  // формата заблокирован — на кнопке показываем бриллиант и открываем пейволл
  // вместо старта. Настройки при этом остаются доступными для просмотра.
  const isLaunchLocked = computed(() => {
    const status = billing.status.value;
    return Boolean(status) && !status!.unlimited && !status!.canCreateInterview;
  });

  function selectSessionGoal(goal: InterviewSessionGoal) {
    if (isSessionGoalLocked(goal)) {
      paywallOpen.value = true;
      return;
    }
    form.sessionGoal = goal;
  }

  // Если выбранный формат оказался платным (статус подгрузился позже) —
  // мягко откатываем на бесплатный «Быстро», чтобы не упереться в ошибку.
  watch(lockedSessionGoals, (locked) => {
    if (locked.includes(form.sessionGoal)) {
      form.sessionGoal = 'quick';
    }
  });

  const FOCUS_VALUES: InterviewFocus[] = [
    'hr_screening',
    'professional',
    'behavioral',
    'salary_negotiation',
  ];

  function focusFromQuery(value: unknown): InterviewFocus | null {
    return typeof value === 'string' &&
      FOCUS_VALUES.includes(value as InterviewFocus)
      ? (value as InterviewFocus)
      : null;
  }

  const routeSource = String(route.query.source || '');
  const initialSource: SourceMode =
    routeSource === 'text' ||
    routeSource === 'profession' ||
    routeSource === 'manual'
      ? 'manual'
      : 'hh_url';

  const sourceMode = ref<SourceMode>(initialSource);
  const isSubmitting = ref(false);
  const isExtractingResume = ref(false);
  const isExtractingQuestionsFile = ref(false);
  const errorMessage = ref('');
  const errorCode = ref('');
  const rolePickerOpen = ref(false);
  const rolePickerRequested = ref(false);
  const roleSearchTerm = ref('');
  const selectedRoleOption = ref<RoleOption | null>(null);
  const selectedContextTags = ref<string[]>([]);
  const customContextDraft = ref('');
  const customContextVisible = ref(false);
  const resumeFileName = ref('');
  const resumeExtractedText = ref('');
  const aiCandidateResumeFileName = ref('');
  const aiCandidateResumeExtractedText = ref('');
  const questionsFileName = ref('');
  const questionsFileText = ref('');

  const form = reactive({
    trainingMode: 'candidate' as TrainingMode,
    hhUrl: '',
    vacancyText: '',
    vacancyTitle: '',
    professionRole: String(route.query.role || ''),
    resumeNotes: '',
    candidatePersona: 'strong_brief' as CandidatePersona,
    candidateDifficulty: 'realistic' as CandidateDifficulty,
    candidateNotes: '',
    level: (route.query.level === 'junior' ||
    route.query.level === 'middle' ||
    route.query.level === 'senior'
      ? route.query.level
      : 'middle') as InterviewLevel,
    sessionGoal: 'standard' as InterviewSessionGoal,
    questionSourceMode: 'mixed' as QuestionSourceMode,
    customQuestionsText: '',
    focus: focusFromQuery(route.query.focus) as InterviewFocus | null,
    interviewerMode: (route.query.mode === 'soft' ||
    route.query.mode === 'neutral' ||
    route.query.mode === 'strict'
      ? route.query.mode
      : 'neutral') as InterviewerMode,
  });

  if (form.professionRole) {
    sourceMode.value = 'manual';
  }

  const sourceTabs: Array<{
    value: SourceMode;
    label: string;
    icon: Component;
  }> = [
    { value: 'hh_url', label: 'interview.new.source.hh', icon: Link2Icon },
    { value: 'manual', label: 'interview.new.source.manual', icon: CubeIcon },
  ];

  const trainingModeOptions: Array<{
    value: TrainingMode;
    title: string;
    description: string;
    meta: string;
  }> = [
    {
      value: 'candidate',
      title: 'interview.new.trainingMode.candidate.title',
      description: 'interview.new.trainingMode.candidate.description',
      meta: 'interview.new.trainingMode.candidate.meta',
    },
    {
      value: 'interviewer',
      title: 'interview.new.trainingMode.interviewer.title',
      description: 'interview.new.trainingMode.interviewer.description',
      meta: 'interview.new.trainingMode.interviewer.meta',
    },
  ];

  const candidatePersonaOptions: Array<{
    value: CandidatePersona;
    title: string;
    description: string;
  }> = [
    {
      value: 'strong_brief',
      title: 'interview.new.aiCandidate.persona.strongBrief.title',
      description: 'interview.new.aiCandidate.persona.strongBrief.description',
    },
    {
      value: 'verbose_vague',
      title: 'interview.new.aiCandidate.persona.verboseVague.title',
      description: 'interview.new.aiCandidate.persona.verboseVague.description',
    },
    {
      value: 'anxious',
      title: 'interview.new.aiCandidate.persona.anxious.title',
      description: 'interview.new.aiCandidate.persona.anxious.description',
    },
    {
      value: 'overconfident',
      title: 'interview.new.aiCandidate.persona.overconfident.title',
      description:
        'interview.new.aiCandidate.persona.overconfident.description',
    },
    {
      value: 'weak_hard_good_soft',
      title: 'interview.new.aiCandidate.persona.weakHardGoodSoft.title',
      description:
        'interview.new.aiCandidate.persona.weakHardGoodSoft.description',
    },
  ];

  const candidateDifficultyOptions: Array<{
    value: CandidateDifficulty;
    label: string;
  }> = [
    { value: 'calm', label: 'interview.new.aiCandidate.difficulty.calm' },
    {
      value: 'realistic',
      label: 'interview.new.aiCandidate.difficulty.realistic',
    },
    {
      value: 'challenging',
      label: 'interview.new.aiCandidate.difficulty.challenging',
    },
  ];

  const interviewerScenarioOptions: Array<{
    value: QuestionSourceMode;
    title: string;
    description: string;
  }> = [
    {
      value: 'glasno',
      title: 'interview.new.customQuestions.mode.glasno.title',
      description: 'interview.new.customQuestions.mode.glasno.description',
    },
    {
      value: 'custom',
      title: 'interview.new.customQuestions.mode.custom.title',
      description: 'interview.new.customQuestions.mode.custom.description',
    },
    {
      value: 'mixed',
      title: 'interview.new.customQuestions.mode.mixed.title',
      description: 'interview.new.customQuestions.mode.mixed.description',
    },
    {
      value: 'free',
      title: 'interview.new.customQuestions.mode.free.title',
      description: 'interview.new.customQuestions.mode.free.description',
    },
  ];

  const roleOptions: RoleOption[] = PROFESSIONAL_ROLE_OPTIONS.map((role) => ({
    role: role.name,
    specialization: '',
    group: role.categoryName,
    aliases: role.aliases,
  }));

  const levelOptions: Array<{
    value: InterviewLevel;
    label: string;
    code: string;
  }> = [
    { value: 'junior', label: 'interview.level.junior', code: 'Junior' },
    { value: 'middle', label: 'interview.level.middle', code: 'Middle' },
    { value: 'senior', label: 'interview.level.senior', code: 'Senior' },
  ];

  const modeOptions: Array<{ value: InterviewerMode; label: string }> = [
    { value: 'soft', label: 'interview.mode.soft' },
    { value: 'neutral', label: 'interview.mode.neutral' },
    { value: 'strict', label: 'interview.mode.strict' },
  ];

  const focusOptions: Array<{
    value: InterviewFocus | null;
    label: string;
    description: string;
  }> = [
    {
      value: null,
      label: 'interview.focus.mixedShort',
      description: 'interview.focus.mixedDescription',
    },
    {
      value: 'hr_screening',
      label: 'interview.focus.hrScreening',
      description: 'interview.focus.hrScreeningDescription',
    },
    {
      value: 'professional',
      label: 'interview.focus.professional',
      description: 'interview.focus.professionalDescription',
    },
    {
      value: 'behavioral',
      label: 'interview.focus.behavioral',
      description: 'interview.focus.behavioralDescription',
    },
    {
      value: 'salary_negotiation',
      label: 'interview.focus.salaryNegotiation',
      description: 'interview.focus.salaryNegotiationDescription',
    },
  ];

  const sessionGoalOptions: Array<{
    value: InterviewSessionGoal;
    title: string;
    description: string;
    meta: string;
    summary: string;
  }> = [
    {
      value: 'quick',
      title: 'interview.goal.quick.title',
      description: 'interview.goal.quick.description',
      meta: 'interview.goal.quick.meta',
      summary: 'Быстро · 3 вопроса',
    },
    {
      value: 'standard',
      title: 'interview.goal.standard.title',
      description: 'interview.goal.standard.description',
      meta: 'interview.goal.standard.meta',
      summary: 'Стандарт · 6 вопросов',
    },
    {
      value: 'deep',
      title: 'interview.goal.deep.title',
      description: 'interview.goal.deep.description',
      meta: 'interview.goal.deep.meta',
      summary: 'Глубоко · 10 вопросов',
    },
  ];

  const avatarByMode: Record<InterviewerMode, InterviewerAvatarId> = {
    soft: 'warm-hr',
    neutral: 'neutral-pro',
    strict: 'strict-lead',
  };

  const preparationSteps = [
    'interview.new.preparing.steps.context',
    'interview.new.preparing.steps.candidate',
    'interview.new.preparing.steps.questions',
    'interview.new.preparing.steps.start',
  ];
  const preparationStepIndex = ref(0);
  const activePreparationStep = computed(
    () =>
      preparationSteps[preparationStepIndex.value] ?? preparationSteps[0] ?? ''
  );
  let preparationTimer: number | null = null;

  const customRoleOption = computed<RoleOption | null>(() => {
    const role = roleSearchTerm.value.trim();
    if (role) {
      const exactMatch = roleOptions.some(
        (option) => option.role.toLowerCase() === role.toLowerCase()
      );
      if (exactMatch) return null;
    }

    return {
      role,
      specialization: role
        ? t('interview.new.roles.customHint')
        : t('interview.new.roles.customEmptyHint'),
      group: t('interview.new.roles.customGroup'),
      custom: true,
    };
  });

  const visibleRoleOptions = computed(() => {
    const query = roleSearchTerm.value.trim().toLowerCase();
    const options = query
      ? roleOptions.filter((item) =>
          `${item.role} ${item.group} ${(item.aliases ?? []).join(' ')}`
            .toLowerCase()
            .includes(query)
        )
      : roleOptions;
    return [
      ...options.slice(0, MAX_VISIBLE_ROLE_OPTIONS),
      customRoleOption.value,
    ].filter((option): option is RoleOption => Boolean(option));
  });

  const roleInputValue = computed({
    get: () =>
      rolePickerOpen.value ? roleSearchTerm.value : form.professionRole,
    set: (value: string) => {
      roleSearchTerm.value = value;
      form.professionRole = value;
      selectedRoleOption.value = null;
    },
  });

  const selectedSourceHint = computed(() => {
    if (isInterviewerTraining.value) {
      if (sourceMode.value === 'hh_url') {
        return t('interview.new.sourceHint.hhInterviewer');
      }
      return t('interview.new.sourceHint.manualInterviewer');
    }
    if (sourceMode.value === 'hh_url') return t('interview.new.sourceHint.hh');
    return t('interview.new.sourceHint.manual');
  });

  const isInterviewerTraining = computed(
    () => form.trainingMode === 'interviewer'
  );

  const customQuestionsCombinedText = computed(() =>
    form.customQuestionsText.trim()
  );

  const customOnlyEnabled = computed({
    get: () => form.questionSourceMode === 'custom',
    set: (enabled: boolean) => {
      form.questionSourceMode = enabled ? 'custom' : 'mixed';
    },
  });

  const showCustomPlanInput = computed(
    () =>
      !isInterviewerTraining.value ||
      form.questionSourceMode === 'custom' ||
      form.questionSourceMode === 'mixed'
  );

  const selectedScenarioSummary = computed(() => {
    if (!isInterviewerTraining.value) return '';
    const option = interviewerScenarioOptions.find(
      (item) => item.value === form.questionSourceMode
    );
    return option ? t(option.title) : '';
  });

  watch(
    () => form.trainingMode,
    (trainingMode) => {
      if (
        trainingMode === 'interviewer' &&
        form.questionSourceMode === 'mixed' &&
        !customQuestionsCombinedText.value
      ) {
        form.questionSourceMode = 'glasno';
      }
      if (
        trainingMode === 'candidate' &&
        ['free', 'glasno'].includes(form.questionSourceMode)
      ) {
        form.questionSourceMode = 'mixed';
      }
    }
  );

  // Теги-подсказки под выбранную роль. Пока роль не выбрана — пусто, блок скрыт.
  const roleContextSuggestions = computed(() =>
    getRoleContextTags(form.professionRole)
  );

  // Отрисовываем объединение: подсказки роли + всё, что пользователь выбрал или
  // добавил вручную (иначе кастомные теги не были бы видны).
  const visibleContextTags = computed(() => {
    const merged = [...roleContextSuggestions.value];
    for (const tag of selectedContextTags.value) {
      if (!merged.includes(tag)) merged.push(tag);
    }
    return merged;
  });

  const contextSpecialization = computed(() =>
    selectedContextTags.value.join(', ').trim()
  );

  const resumeContextText = computed(() => {
    const parts: string[] = [];
    const extracted = isInterviewerTraining.value
      ? aiCandidateResumeExtractedText.value.trim()
      : resumeExtractedText.value.trim();
    const notes = isInterviewerTraining.value
      ? form.candidateNotes.trim()
      : form.resumeNotes.trim();
    const fileName = isInterviewerTraining.value
      ? aiCandidateResumeFileName.value
      : resumeFileName.value;

    if (extracted) {
      parts.push(
        `${
          isInterviewerTraining.value ? 'Резюме кандидата' : 'Резюме из файла'
        } ${fileName ? `"${fileName}"` : ''}:\n${extracted}`
      );
    }

    if (notes) {
      parts.push(
        `${
          isInterviewerTraining.value
            ? 'Дополнительные заметки о кандидате'
            : 'Дополнительно от кандидата'
        }:\n${notes}`
      );
    }

    return trimResumeContext(parts.join('\n\n'));
  });

  const activeResumeFileName = computed(() =>
    isInterviewerTraining.value
      ? aiCandidateResumeFileName.value
      : resumeFileName.value
  );

  const activeResumeExtractedText = computed(() =>
    isInterviewerTraining.value
      ? aiCandidateResumeExtractedText.value
      : resumeExtractedText.value
  );

  const resumePreviewBlocks = computed(() =>
    buildResumePreviewBlocks(activeResumeExtractedText.value)
  );

  const resumePreviewMeta = computed(() => {
    const count = activeResumeExtractedText.value.length;
    return count
      ? t('interview.new.resume.previewMeta', { count })
      : t('interview.new.resume.previewEmptyMeta');
  });

  const manualDescriptionReady = computed(() => {
    const vacancyText = form.vacancyText.trim();
    return vacancyText.length === 0 || vacancyText.length >= 10;
  });

  const sourceContextReady = computed(() => {
    if (sourceMode.value === 'hh_url') return form.hhUrl.trim().length > 0;
    return isManualInterviewSourceReady({
      role: form.professionRole,
      vacancyText: form.vacancyText,
    });
  });

  const selectedGoalSummary = computed(
    () =>
      sessionGoalOptions.find((option) => option.value === form.sessionGoal)
        ?.summary ?? 'Стандарт · 6 вопросов'
  );

  const selectedTrainingModeSummary = computed(() =>
    t(
      isInterviewerTraining.value
        ? 'interview.new.trainingMode.interviewer.summary'
        : 'interview.new.trainingMode.candidate.summary'
    )
  );

  const selectedFocusSummary = computed(() => {
    const option = focusOptions.find((item) => item.value === form.focus);
    return option ? t(option.label) : t('interview.focus.mixedShort');
  });

  const selectedLevelSummary = computed(() => {
    const option = levelOptions.find((item) => item.value === form.level);
    const prefix = isInterviewerTraining.value
      ? t('interview.new.aiCandidate.levelPrefix')
      : '';
    const label = option ? `${t(option.label)} · ${option.code}` : 'Middle';
    return prefix ? `${prefix}: ${label}` : label;
  });

  const submitBlockerMessage = computed(() => {
    if (
      form.questionSourceMode === 'custom' &&
      customQuestionsCombinedText.value.length < 8
    ) {
      return t('interview.new.actions.needCustomQuestions');
    }
    if (!sourceContextReady.value) {
      if (sourceMode.value === 'manual' && !manualDescriptionReady.value) {
        return t('interview.new.actions.needManualDescription');
      }
      return t('interview.new.actions.needVacancyContext');
    }
    return '';
  });

  const canSubmit = computed(
    () => !isSubmitting.value && !submitBlockerMessage.value
  );

  function trimResumeContext(value: string): string {
    if (value.length <= MAX_RESUME_CONTEXT_CHARS) return value;
    return value.slice(0, MAX_RESUME_CONTEXT_CHARS - 96).trimEnd();
  }

  function setRolePickerOpen(open: boolean) {
    if (open && !rolePickerRequested.value) return;
    rolePickerOpen.value = open;
    if (open) {
      roleSearchTerm.value = '';
      return;
    }
    rolePickerRequested.value = false;
    roleSearchTerm.value = '';
  }

  function openRolePicker() {
    rolePickerRequested.value = true;
    setRolePickerOpen(true);
  }

  async function focusProfessionRoleInput() {
    await nextTick();
    if (typeof document === 'undefined' || typeof window === 'undefined')
      return;
    const focusInput = () => {
      rolePickerRequested.value = false;
      rolePickerOpen.value = false;
      document.getElementById('profession-role')?.focus();
    };
    window.requestAnimationFrame(() => {
      focusInput();
      window.setTimeout(focusInput, 80);
    });
  }

  function selectRole(option: RoleOption) {
    const selection = resolveProfessionSelection(option);

    form.professionRole = selection.role;
    selectedRoleOption.value = selection.selectedOption as RoleOption | null;
    roleSearchTerm.value = '';

    if (selection.keepPickerOpen) {
      rolePickerRequested.value = true;
      rolePickerOpen.value = true;
      return;
    }

    setRolePickerOpen(false);
    if (selection.focusInput) {
      void focusProfessionRoleInput();
    }
  }

  function selectRoleValue(value: unknown) {
    if (value && typeof value === 'object' && 'role' in value) {
      selectRole(value as RoleOption);
    }
  }

  function toggleContextTag(tag: string) {
    const normalized = tag.trim();
    if (!normalized) return;
    selectedContextTags.value = selectedContextTags.value.includes(normalized)
      ? selectedContextTags.value.filter((item) => item !== normalized)
      : [...selectedContextTags.value, normalized];
  }

  function addCustomContextTag() {
    const value = customContextDraft.value.trim();
    if (!value) {
      customContextVisible.value = true;
      return;
    }
    if (!selectedContextTags.value.includes(value)) {
      selectedContextTags.value = [...selectedContextTags.value, value];
    }
    customContextDraft.value = '';
    customContextVisible.value = false;
  }

  function buildPayload(): CreateInterviewSessionRequestInput {
    const base = {
      trainingMode: form.trainingMode,
      resumeText: resumeContextText.value || undefined,
      role: form.professionRole.trim() || undefined,
      level: form.level,
      sessionGoal: form.sessionGoal,
      questionSourceMode: form.questionSourceMode,
      focus: form.focus ?? undefined,
      customQuestionsText:
        form.questionSourceMode === 'custom' ||
        form.questionSourceMode === 'mixed'
          ? customQuestionsCombinedText.value || undefined
          : undefined,
      candidatePersona: isInterviewerTraining.value
        ? form.candidatePersona
        : undefined,
      candidateDifficulty: isInterviewerTraining.value
        ? form.candidateDifficulty
        : undefined,
      candidateNotes: isInterviewerTraining.value
        ? form.candidateNotes.trim() || undefined
        : undefined,
      language: 'ru' as const,
      interviewerMode: form.interviewerMode,
      interviewerAvatarId: avatarByMode[form.interviewerMode],
    };

    if (sourceMode.value === 'hh_url') {
      return {
        ...base,
        source: { type: 'hh_url', url: form.hhUrl.trim() },
      };
    }

    return {
      ...base,
      source: buildManualInterviewSource({
        role: form.professionRole,
        specialization: contextSpecialization.value,
        vacancyText: form.vacancyText,
        vacancyTitle: form.vacancyTitle,
      }),
    };
  }

  function extractApiError(error: unknown): string {
    const fallback = t('interview.common.unknownError');
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (
        error as { data?: { error?: { code?: string; message?: string } } }
      ).data;
      errorCode.value = data?.error?.code || '';
      return sanitizeProviderErrorMessage(data?.error?.message, fallback);
    }
    errorCode.value = '';
    return sanitizeProviderErrorMessage(
      error instanceof Error ? error.message : '',
      fallback
    );
  }

  async function onResumeFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const target = isInterviewerTraining.value ? 'ai_candidate' : 'candidate';

    if (target === 'ai_candidate') {
      aiCandidateResumeFileName.value = file.name;
      aiCandidateResumeExtractedText.value = '';
    } else {
      resumeFileName.value = file.name;
      resumeExtractedText.value = '';
    }
    isExtractingResume.value = true;
    errorMessage.value = '';
    errorCode.value = '';
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await api<ResumeExtractResponse>(
        '/api/interview/resume/extract',
        {
          method: 'POST',
          body,
        }
      );
      if (target === 'ai_candidate') {
        aiCandidateResumeExtractedText.value = response.text;
        aiCandidateResumeFileName.value = response.fileName || file.name;
      } else {
        resumeExtractedText.value = response.text;
        resumeFileName.value = response.fileName || file.name;
      }
    } catch (err) {
      if (target === 'ai_candidate') {
        aiCandidateResumeFileName.value = '';
        aiCandidateResumeExtractedText.value = '';
      } else {
        resumeFileName.value = '';
        resumeExtractedText.value = '';
      }
      errorMessage.value = extractApiError(err);
    } finally {
      isExtractingResume.value = false;
      input.value = '';
    }
  }

  function clearResumeFile() {
    if (isInterviewerTraining.value) {
      aiCandidateResumeFileName.value = '';
      aiCandidateResumeExtractedText.value = '';
      return;
    }
    resumeFileName.value = '';
    resumeExtractedText.value = '';
  }

  async function onCustomQuestionsFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    questionsFileName.value = file.name;
    isExtractingQuestionsFile.value = true;
    errorMessage.value = '';
    errorCode.value = '';
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await api<QuestionInputExtractResponse>(
        '/api/interview/custom-questions/extract',
        {
          method: 'POST',
          body,
        }
      );
      questionsFileText.value = response.text;
      questionsFileName.value = response.fileName || file.name;
      form.customQuestionsText = appendTextBlock(
        form.customQuestionsText,
        response.text
      );
    } catch (err) {
      errorMessage.value = extractApiError(err);
    } finally {
      isExtractingQuestionsFile.value = false;
      input.value = '';
    }
  }

  function appendTextBlock(current: string, next: string): string {
    const normalized = next.trim();
    if (!normalized) return current;
    const base = current.trim();
    return base ? `${base}\n\n${normalized}` : normalized;
  }

  function stopPreparationTimer() {
    if (preparationTimer === null || typeof window === 'undefined') return;
    window.clearInterval(preparationTimer);
    preparationTimer = null;
  }

  function startPreparationTimer() {
    preparationStepIndex.value = 0;
    if (typeof window === 'undefined') return;
    stopPreparationTimer();
    preparationTimer = window.setInterval(() => {
      preparationStepIndex.value =
        (preparationStepIndex.value + 1) % preparationSteps.length;
    }, 1700);
  }

  async function submit() {
    if (isLaunchLocked.value) {
      paywallOpen.value = true;
      return;
    }
    if (!canSubmit.value) return;

    isSubmitting.value = true;
    errorMessage.value = '';
    errorCode.value = '';
    try {
      const state = await api<InterviewStateResponse>(
        '/api/interview/sessions',
        {
          method: 'POST',
          body: buildPayload(),
        }
      );
      await navigateTo(`/interview/${state.session.id}`);
    } catch (err) {
      errorMessage.value = extractApiError(err);
    } finally {
      isSubmitting.value = false;
    }
  }

  watch(isSubmitting, (submitting) => {
    if (submitting) {
      startPreparationTimer();
      return;
    }
    stopPreparationTimer();
  });

  onBeforeUnmount(() => {
    stopPreparationTimer();
  });
</script>

<template>
  <form class="interview-page app-page" @submit.prevent="submit">
    <section class="setup-shell glass-frame">
      <div class="setup-head">
        <p class="panel-label">{{ t('interview.new.context.kicker') }}</p>
        <h1>{{ t('interview.new.context.title') }}</h1>
      </div>

      <section class="training-mode-grid" role="radiogroup">
        <button
          v-for="option in trainingModeOptions"
          :key="option.value"
          type="button"
          class="training-mode-card"
          :class="{
            'training-mode-card--active': form.trainingMode === option.value,
          }"
          role="radio"
          :aria-checked="form.trainingMode === option.value"
          @click="form.trainingMode = option.value"
        >
          <span>
            <strong>{{ t(option.title) }}</strong>
            <small>{{ t(option.description) }}</small>
          </span>
          <em>{{ t(option.meta) }}</em>
        </button>
      </section>

      <div class="context-grid">
        <article id="vacancy" class="context-column section-anchor">
          <div class="panel-head panel-head--compact">
            <div>
              <p class="panel-label">
                {{
                  t(
                    isInterviewerTraining
                      ? 'interview.new.source.kickerInterviewer'
                      : 'interview.new.source.kicker'
                  )
                }}
              </p>
              <h2>
                {{
                  t(
                    isInterviewerTraining
                      ? 'interview.new.source.titleInterviewer'
                      : 'interview.new.source.title'
                  )
                }}
              </h2>
            </div>
            <button
              v-tooltip="
                t(
                  isInterviewerTraining
                    ? 'interview.new.sourceHelpInterviewer'
                    : 'interview.new.sourceHelp'
                )
              "
              class="help-button"
              type="button"
              :aria-label="
                t(
                  isInterviewerTraining
                    ? 'interview.new.sourceHelpInterviewer'
                    : 'interview.new.sourceHelp'
                )
              "
            >
              <QuestionMarkCircledIcon aria-hidden="true" />
            </button>
          </div>

          <div class="source-tabs" role="tablist">
            <button
              v-for="tab in sourceTabs"
              :key="tab.value"
              type="button"
              class="source-tab"
              :class="{ 'source-tab--active': sourceMode === tab.value }"
              role="tab"
              :aria-selected="sourceMode === tab.value"
              @click="sourceMode = tab.value"
            >
              <component :is="tab.icon" aria-hidden="true" />
              {{ t(tab.label) }}
            </button>
          </div>

          <p class="source-hint">{{ selectedSourceHint }}</p>

          <div v-if="sourceMode === 'hh_url'" class="field">
            <label for="hh-url">{{ t('interview.new.fields.hhUrl') }}</label>
            <div class="input-shell">
              <Link2Icon aria-hidden="true" />
              <input
                id="hh-url"
                v-model="form.hhUrl"
                class="text-control"
                type="url"
                inputmode="url"
                placeholder="https://company.ru/careers/product-manager"
              >
            </div>
          </div>

          <div v-else class="manual-source-stack">
            <div class="field role-field">
              <label for="profession-role">{{
                t('interview.new.fields.professionRole')
              }}</label>
              <ComboboxRoot
                :model-value="selectedRoleOption"
                :open="rolePickerOpen"
                class="role-combobox"
                :ignore-filter="true"
                @update:open="setRolePickerOpen"
                @update:model-value="selectRoleValue"
              >
                <ComboboxAnchor class="role-anchor">
                  <ComboboxInput
                    id="profession-role"
                    v-model="roleInputValue"
                    class="text-control"
                    autocomplete="off"
                    :display-value="
                      (value) =>
                        value && typeof value === 'object' && 'role' in value
                          ? String(value.role)
                          : form.professionRole
                    "
                    :placeholder="
                      t('interview.new.placeholders.professionRole')
                    "
                    @click="openRolePicker"
                  />
                </ComboboxAnchor>

                <ComboboxPortal v-if="rolePickerRequested && rolePickerOpen">
                  <ComboboxContent
                    class="role-menu glass-frame glass-frame--soft"
                    position="popper"
                    side="bottom"
                    align="start"
                    :side-offset="8"
                    :side-flip="true"
                    :collision-padding="{
                      top: 12,
                      right: 12,
                      bottom: 108,
                      left: 12,
                    }"
                  >
                    <ComboboxViewport class="role-menu-viewport">
                      <ComboboxItem
                        v-for="option in visibleRoleOptions"
                        :key="`${option.group}-${option.role}`"
                        :value="option"
                        class="role-option"
                        :class="{ 'role-option--custom': option.custom }"
                      >
                        <span>
                          <strong>
                            {{
                              option.custom && option.role
                                ? t('interview.new.roles.customAction', {
                                    role: option.role,
                                  })
                                : option.custom
                                ? t('interview.new.roles.customEmptyAction')
                                : option.role
                            }}
                          </strong>
                          <small>{{ option.group }}</small>
                        </span>
                        <CheckIcon
                          v-if="selectedRoleOption?.role === option.role"
                          class="role-option-check"
                          aria-hidden="true"
                        />
                      </ComboboxItem>
                      <ComboboxEmpty class="role-empty">
                        {{ t('interview.new.emptyRoles') }}
                      </ComboboxEmpty>
                    </ComboboxViewport>
                  </ComboboxContent>
                </ComboboxPortal>
              </ComboboxRoot>
              <p class="field-hint">
                {{ t('interview.new.roles.freeInputHint') }}
              </p>
            </div>

            <div v-if="form.professionRole.trim()" class="field">
              <span class="field-label">{{
                t('interview.new.contextTags.title')
              }}</span>
              <p class="field-hint">
                {{ t('interview.new.contextTags.hint') }}
              </p>
              <div class="context-tags">
                <button
                  v-for="tag in visibleContextTags"
                  :key="tag"
                  type="button"
                  class="context-tag"
                  :class="{
                    'context-tag--active': selectedContextTags.includes(tag),
                  }"
                  :aria-pressed="selectedContextTags.includes(tag)"
                  @click="toggleContextTag(tag)"
                >
                  {{ tag }}
                  <span
                    v-if="selectedContextTags.includes(tag)"
                    class="context-tag__x"
                    aria-hidden="true"
                    >×</span
                  >
                </button>
                <button
                  type="button"
                  class="context-tag context-tag--add"
                  @click="customContextVisible = true"
                >
                  {{ t('interview.new.contextTags.addCustom') }}
                </button>
              </div>
              <div v-if="customContextVisible" class="custom-context-row">
                <input
                  v-model="customContextDraft"
                  class="text-control"
                  type="text"
                  :aria-label="t('interview.new.contextTags.customLabel')"
                  :placeholder="
                    t('interview.new.contextTags.customPlaceholder')
                  "
                  @keydown.enter.prevent="addCustomContextTag"
                >
                <button
                  type="button"
                  class="secondary-button"
                  @click="addCustomContextTag"
                >
                  {{ t('interview.new.contextTags.addCustom') }}
                </button>
              </div>
            </div>

            <div class="field">
              <label for="vacancy-text">{{
                t('interview.new.fields.vacancyText')
              }}</label>
              <VoiceTextarea
                id="vacancy-text"
                v-model="form.vacancyText"
                :rows="7"
                :placeholder="t('interview.new.placeholders.vacancyText')"
              />
              <p
                v-if="!manualDescriptionReady"
                class="field-hint field-hint--warning"
              >
                {{ t('interview.new.actions.needManualDescription') }}
              </p>
            </div>
          </div>
        </article>

        <article
          id="experience"
          class="context-column context-column--candidate section-anchor"
        >
          <div class="panel-head panel-head--compact">
            <div>
              <p class="panel-label">
                {{
                  t(
                    isInterviewerTraining
                      ? 'interview.new.aiCandidate.kicker'
                      : 'interview.new.resume.kicker'
                  )
                }}
              </p>
              <h2>
                {{
                  t(
                    isInterviewerTraining
                      ? 'interview.new.aiCandidate.title'
                      : 'interview.new.resume.title'
                  )
                }}
              </h2>
            </div>
          </div>

          <p class="source-hint">
            {{
              t(
                isInterviewerTraining
                  ? 'interview.new.aiCandidate.helper'
                  : 'interview.new.resume.helper'
              )
            }}
          </p>

          <div class="candidate-stack">
            <div v-if="isInterviewerTraining" class="field">
              <span class="field-label">
                {{ t('interview.new.aiCandidate.personaTitle') }}
              </span>
              <div class="candidate-option-grid" role="radiogroup">
                <button
                  v-for="option in candidatePersonaOptions"
                  :key="option.value"
                  type="button"
                  class="focus-chip"
                  :class="{
                    'focus-chip--active':
                      form.candidatePersona === option.value,
                  }"
                  role="radio"
                  :aria-checked="form.candidatePersona === option.value"
                  @click="form.candidatePersona = option.value"
                >
                  <strong>{{ t(option.title) }}</strong>
                  <small>{{ t(option.description) }}</small>
                </button>
              </div>
            </div>

            <div v-if="isInterviewerTraining" class="field">
              <span class="field-label">
                {{ t('interview.new.aiCandidate.difficultyTitle') }}
              </span>
              <div class="segmented segmented--compact" role="radiogroup">
                <button
                  v-for="option in candidateDifficultyOptions"
                  :key="option.value"
                  type="button"
                  class="segment"
                  :class="{
                    'segment--active':
                      form.candidateDifficulty === option.value,
                  }"
                  role="radio"
                  :aria-checked="form.candidateDifficulty === option.value"
                  @click="form.candidateDifficulty = option.value"
                >
                  {{ t(option.label) }}
                </button>
              </div>
            </div>

            <div class="field">
              <label for="resume-file">{{
                t(
                  isInterviewerTraining
                    ? 'interview.new.aiCandidate.resumeFile'
                    : 'interview.new.resume.file'
                )
              }}</label>
              <div class="file-upload file-upload--compact">
                <input
                  id="resume-file"
                  class="file-input"
                  type="file"
                  accept=".pdf,.txt,.md,.png,.jpg,.jpeg,text/plain,text/markdown,application/pdf,image/png,image/jpeg"
                  :disabled="isExtractingResume"
                  @change="onResumeFileChange"
                >
                <label
                  class="file-drop file-drop--compact button-loader-host"
                  for="resume-file"
                >
                  <ButtonLoader v-if="isExtractingResume" />
                  <span
                    class="button-loader-content file-drop__content"
                    :class="{
                      'button-loader-content--loading': isExtractingResume,
                    }"
                  >
                    <span class="file-drop__icon" aria-hidden="true">
                      <FileTextIcon />
                    </span>
                    <span class="file-drop__copy">
                      <strong>
                        {{
                          t(
                            isInterviewerTraining
                              ? 'interview.new.aiCandidate.uploadTitle'
                              : 'interview.new.resume.uploadTitle'
                          )
                        }}
                      </strong>
                      <small>
                        {{
                          activeResumeFileName ||
                          t(
                            isInterviewerTraining
                              ? 'interview.new.aiCandidate.uploadHint'
                              : 'interview.new.resume.uploadHint'
                          )
                        }}
                      </small>
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <section
              v-if="isExtractingResume || resumePreviewBlocks.length"
              class="resume-preview"
            >
              <div class="resume-preview__head">
                <div class="resume-preview__title">
                  <span>{{ t('interview.new.resume.previewKicker') }}</span>
                  <strong>{{ t('interview.new.resume.previewTitle') }}</strong>
                </div>
                <div class="resume-preview__actions">
                  <small>{{ resumePreviewMeta }}</small>
                  <button
                    v-if="activeResumeFileName || activeResumeExtractedText"
                    class="resume-preview__clear"
                    type="button"
                    :aria-label="t('interview.new.resume.clearFile')"
                    :title="t('interview.new.resume.clearFile')"
                    @click="clearResumeFile"
                  >
                    <Cross2Icon aria-hidden="true" />
                    <span>{{ t('interview.new.resume.clearFile') }}</span>
                  </button>
                </div>
              </div>

              <GlassSkeletonStack
                v-if="isExtractingResume"
                class="resume-preview__skeleton"
                :heights="[28, 18, 18, 64, 18]"
              />

              <div v-else class="resume-preview__body">
                <template v-for="block in resumePreviewBlocks" :key="block.id">
                  <h3
                    v-if="block.type === 'heading'"
                    class="resume-preview__heading"
                  >
                    {{ block.text }}
                  </h3>
                  <ul
                    v-else-if="block.type === 'list'"
                    class="resume-preview__list"
                  >
                    <li v-for="item in block.items" :key="item">{{ item }}</li>
                  </ul>
                  <p v-else class="resume-preview__paragraph">
                    {{ block.text }}
                  </p>
                </template>
              </div>
            </section>

            <div class="field">
              <label v-if="!isInterviewerTraining" for="resume-notes">{{
                t('interview.new.resume.notes')
              }}</label>
              <label v-else for="candidate-notes">{{
                t('interview.new.aiCandidate.notes')
              }}</label>
              <VoiceTextarea
                v-if="!isInterviewerTraining"
                id="resume-notes"
                v-model="form.resumeNotes"
                :rows="5"
                :placeholder="t('interview.new.placeholders.resumeText')"
              />
              <VoiceTextarea
                v-else
                id="candidate-notes"
                v-model="form.candidateNotes"
                :rows="5"
                :placeholder="t('interview.new.aiCandidate.notesPlaceholder')"
              />
            </div>
          </div>
        </article>
      </div>
    </section>

    <section id="settings" class="settings-panel glass-frame section-anchor">
      <div class="panel-head">
        <div>
          <p class="panel-label">{{ t('interview.new.params.kicker') }}</p>
          <h2>
            {{
              t(
                isInterviewerTraining
                  ? 'interview.new.params.titleInterviewer'
                  : 'interview.new.params.title'
              )
            }}
          </h2>
        </div>
      </div>

      <div class="settings-stack">
        <section class="parameter-group">
          <div class="parameter-copy">
            <h3>{{ t('interview.new.fields.sessionGoal') }}</h3>
          </div>
          <div class="goal-grid" role="radiogroup">
            <button
              v-for="option in sessionGoalOptions"
              :key="option.value"
              type="button"
              class="goal-card"
              :class="{
                'goal-card--active': form.sessionGoal === option.value,
                'goal-card--locked': isSessionGoalLocked(option.value),
              }"
              role="radio"
              :aria-checked="form.sessionGoal === option.value"
              :aria-disabled="isSessionGoalLocked(option.value)"
              @click="selectSessionGoal(option.value)"
            >
              <strong>{{ t(option.title) }}</strong>
              <span>{{ t(option.description) }}</span>
              <small>{{ t(option.meta) }}</small>
              <span
                v-if="isSessionGoalLocked(option.value)"
                class="goal-card__lock"
              >
                <LockClosedIcon aria-hidden="true" />
                {{ t('interview.goal.lockedBadge') }}
              </span>
            </button>
          </div>
          <p v-if="lockedSessionGoals.length" class="goal-locked-hint">
            {{ t('interview.goal.lockedHint') }}
            <NuxtLink to="/pricing">{{
              t('interview.goal.lockedAction')
            }}</NuxtLink>
          </p>
        </section>

        <section class="parameter-group">
          <div class="parameter-copy">
            <h3>
              {{
                t(
                  isInterviewerTraining
                    ? 'interview.new.fields.candidateLevel'
                    : 'interview.new.fields.level'
                )
              }}
            </h3>
          </div>
          <div class="goal-grid" role="radiogroup">
            <button
              v-for="option in levelOptions"
              :key="option.value"
              type="button"
              class="goal-card"
              :class="{ 'goal-card--active': form.level === option.value }"
              role="radio"
              :aria-checked="form.level === option.value"
              @click="form.level = option.value"
            >
              <strong>{{ t(option.label) }}</strong>
              <small>{{ option.code }}</small>
            </button>
          </div>
        </section>

        <section class="parameter-group">
          <div class="parameter-copy">
            <h3>
              {{
                t(
                  isInterviewerTraining
                    ? 'interview.new.fields.focusInterviewer'
                    : 'interview.new.fields.focus'
                )
              }}
            </h3>
            <p>
              {{
                t(
                  isInterviewerTraining
                    ? 'interview.new.fields.focusHintInterviewer'
                    : 'interview.new.fields.focusHint'
                )
              }}
            </p>
          </div>
          <div class="focus-chip-grid" role="radiogroup">
            <button
              v-for="option in focusOptions"
              :key="option.label"
              type="button"
              class="focus-chip"
              :class="{ 'focus-chip--active': form.focus === option.value }"
              role="radio"
              :aria-checked="form.focus === option.value"
              @click="form.focus = option.value"
            >
              <strong>{{ t(option.label) }}</strong>
              <small>{{ t(option.description) }}</small>
            </button>
          </div>
        </section>

        <details class="advanced-panel">
          <summary>
            <span>
              <strong>{{ t('interview.new.advanced.title') }}</strong>
              <small>
                {{
                  t(
                    isInterviewerTraining
                      ? 'interview.new.advanced.summaryInterviewer'
                      : 'interview.new.advanced.summary'
                  )
                }}
              </small>
            </span>
            <span class="advanced-panel__chevron" aria-hidden="true">
              <ChevronDownIcon />
            </span>
          </summary>

          <div class="advanced-content">
            <section
              v-if="!isInterviewerTraining"
              class="parameter-group parameter-group--advanced"
            >
              <div class="parameter-copy">
                <h3>{{ t('interview.new.fields.interviewerMode') }}</h3>
                <p>{{ t('interview.new.advanced.interviewerSummary') }}</p>
              </div>
              <div class="segmented segmented--compact" role="radiogroup">
                <button
                  v-for="option in modeOptions"
                  :key="option.value"
                  type="button"
                  class="segment"
                  :class="{
                    'segment--active': form.interviewerMode === option.value,
                  }"
                  role="radio"
                  :aria-checked="form.interviewerMode === option.value"
                  @click="form.interviewerMode = option.value"
                >
                  {{ t(option.label) }}
                </button>
              </div>
            </section>

            <section class="custom-questions-panel">
              <div class="panel-head panel-head--compact">
                <div>
                  <p class="panel-label">
                    {{
                      t(
                        isInterviewerTraining
                          ? 'interview.new.customQuestions.kickerInterviewer'
                          : 'interview.new.customQuestions.kicker'
                      )
                    }}
                  </p>
                  <h3>
                    {{
                      t(
                        isInterviewerTraining
                          ? 'interview.new.customQuestions.titleInterviewer'
                          : 'interview.new.customQuestions.title'
                      )
                    }}
                  </h3>
                </div>
                <button
                  v-tooltip="
                    t(
                      isInterviewerTraining
                        ? 'interview.new.customQuestions.tooltipInterviewer'
                        : 'interview.new.customQuestions.tooltip'
                    )
                  "
                  class="help-button"
                  type="button"
                  :aria-label="
                    t(
                      isInterviewerTraining
                        ? 'interview.new.customQuestions.tooltipInterviewer'
                        : 'interview.new.customQuestions.tooltip'
                    )
                  "
                >
                  <QuestionMarkCircledIcon aria-hidden="true" />
                </button>
              </div>

              <div
                v-if="isInterviewerTraining"
                class="interviewer-scenario-grid"
                role="radiogroup"
                :aria-label="t('interview.new.customQuestions.scenarioLabel')"
              >
                <button
                  v-for="option in interviewerScenarioOptions"
                  :key="option.value"
                  type="button"
                  class="scenario-card"
                  :class="{
                    'scenario-card--active':
                      form.questionSourceMode === option.value,
                  }"
                  role="radio"
                  :aria-checked="form.questionSourceMode === option.value"
                  @click="form.questionSourceMode = option.value"
                >
                  <strong>{{ t(option.title) }}</strong>
                  <small>{{ t(option.description) }}</small>
                </button>
              </div>

              <div v-if="showCustomPlanInput" class="custom-questions-grid">
                <div class="field">
                  <label for="custom-questions">{{
                    t(
                      isInterviewerTraining
                        ? 'interview.new.customQuestions.labelInterviewer'
                        : 'interview.new.customQuestions.label'
                    )
                  }}</label>
                  <VoiceTextarea
                    id="custom-questions"
                    v-model="form.customQuestionsText"
                    :rows="5"
                    :placeholder="
                      t(
                        isInterviewerTraining
                          ? 'interview.new.customQuestions.placeholderInterviewer'
                          : 'interview.new.customQuestions.placeholder'
                      )
                    "
                  />
                </div>

                <div class="question-options">
                  <div class="field">
                    <label for="custom-questions-file">{{
                      t('interview.new.customQuestions.file')
                    }}</label>
                    <div class="file-upload file-upload--compact">
                      <input
                        id="custom-questions-file"
                        class="file-input"
                        type="file"
                        accept=".pdf,.txt,.md,.csv,.xls,.xlsx,.png,.jpg,.jpeg,text/plain,text/markdown,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg"
                        :disabled="isExtractingQuestionsFile"
                        @change="onCustomQuestionsFileChange"
                      >
                      <label
                        class="file-drop file-drop--compact button-loader-host"
                        for="custom-questions-file"
                      >
                        <ButtonLoader v-if="isExtractingQuestionsFile" />
                        <span
                          class="button-loader-content file-drop__content"
                          :class="{
                            'button-loader-content--loading':
                              isExtractingQuestionsFile,
                          }"
                        >
                          <span class="file-drop__icon" aria-hidden="true">
                            <FileTextIcon />
                          </span>
                          <span class="file-drop__copy">
                            <strong>
                              {{
                                t('interview.new.customQuestions.uploadTitle')
                              }}
                            </strong>
                            <small>
                              {{
                                questionsFileName ||
                                t('interview.new.customQuestions.uploadHint')
                              }}
                            </small>
                          </span>
                        </span>
                      </label>
                    </div>
                    <GlassSkeletonStack
                      v-if="isExtractingQuestionsFile"
                      class="custom-questions-skeleton"
                      :heights="[34, 76]"
                    />
                    <p v-if="questionsFileText" class="file-note">
                      {{
                        t('interview.new.customQuestions.fileAdded', {
                          count: questionsFileText.length,
                        })
                      }}
                    </p>
                  </div>

                  <label v-if="!isInterviewerTraining" class="toggle-option">
                    <input v-model="customOnlyEnabled" type="checkbox">
                    <span class="toggle-switch" aria-hidden="true" />
                    <span class="toggle-copy">
                      <strong>{{
                        t(
                          isInterviewerTraining
                            ? 'interview.new.customQuestions.onlyMineInterviewer'
                            : 'interview.new.customQuestions.onlyMine'
                        )
                      }}</strong>
                      <small>{{
                        t(
                          isInterviewerTraining
                            ? 'interview.new.customQuestions.onlyMineHintInterviewer'
                            : 'interview.new.customQuestions.onlyMineHint'
                        )
                      }}</small>
                    </span>
                  </label>
                </div>
              </div>
              <p v-else class="scenario-note">
                {{
                  t(
                    form.questionSourceMode === 'free'
                      ? 'interview.new.customQuestions.mode.free.note'
                      : 'interview.new.customQuestions.mode.glasno.note'
                  )
                }}
              </p>
            </section>
          </div>
        </details>
      </div>
    </section>

    <div v-if="errorMessage" class="error-box glass-frame">
      <p>{{ errorMessage }}</p>
      <NuxtLink v-if="errorCode === 'E_FORBIDDEN'" to="/pricing">
        {{ t('interview.new.limit.pricing') }}
      </NuxtLink>
    </div>

    <section id="start" class="sticky-start-bar glass-frame section-anchor">
      <div class="sticky-start-bar__copy">
        <p>{{ t('interview.new.sticky.title') }}</p>
        <div class="summary-chips" aria-label="Параметры интервью">
          <span>{{ selectedTrainingModeSummary }}</span>
          <span v-if="selectedScenarioSummary">{{ selectedScenarioSummary }}</span>
          <span>{{ selectedGoalSummary }}</span>
          <span>{{ selectedFocusSummary }}</span>
          <span>{{ selectedLevelSummary }}</span>
        </div>
      </div>

      <div class="sticky-start-bar__actions">
        <p
          v-if="submitBlockerMessage && !isSubmitting && !isLaunchLocked"
          class="actions-hint"
        >
          {{ submitBlockerMessage }}
        </p>
        <p v-else-if="isLaunchLocked" class="actions-hint actions-hint--locked">
          {{ t('interview.new.actions.lockedHint') }}
        </p>
        <button
          class="primary-action start-button button-loader-host"
          :class="{ 'start-button--locked': isLaunchLocked }"
          type="submit"
          :disabled="isLaunchLocked ? isSubmitting : !canSubmit"
        >
          <ButtonLoader v-if="isSubmitting" />
          <span
            class="button-loader-content"
            :class="{ 'button-loader-content--loading': isSubmitting }"
          >
            <span
              v-if="isLaunchLocked"
              class="start-button__diamond"
              aria-hidden="true"
              >💎</span
            >
            {{
              isLaunchLocked
                ? t('interview.new.actions.unlock')
                : t(
                    isInterviewerTraining
                      ? 'interview.new.actions.startInterviewer'
                      : 'interview.new.actions.start'
                  )
            }}
            <span class="primary-action__icon" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </span>
        </button>
      </div>
    </section>

    <PaywallModal v-model:open="paywallOpen" mode="plans" />

    <div
      v-if="isSubmitting"
      class="interview-start-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interview-start-title"
      aria-describedby="interview-start-description"
    >
      <section
        class="interview-start-card glass-frame"
        role="status"
        aria-live="polite"
      >
        <div class="interview-start-visual" aria-hidden="true">
          <span class="interview-start-ring" />
          <span class="interview-start-ring interview-start-ring--slow" />
          <span class="interview-start-core" />
        </div>

        <div class="interview-start-content">
          <p class="panel-label">{{ t('interview.new.preparing.eyebrow') }}</p>
          <h2 id="interview-start-title">
            {{ t('interview.new.preparing.title') }}
          </h2>
          <p id="interview-start-description">
            {{ t(activePreparationStep) }}
          </p>

          <ol class="interview-start-steps">
            <li
              v-for="(step, index) in preparationSteps"
              :key="step"
              :class="{
                'interview-start-steps__item--active':
                  index === preparationStepIndex,
              }"
            >
              <span />
              {{ t(step) }}
            </li>
          </ol>
        </div>
      </section>
    </div>
  </form>
</template>

<style scoped>
  .interview-page {
    gap: clamp(12px, 1.6vw, 16px);
    padding-bottom: calc(104px + env(safe-area-inset-bottom));
  }

  .section-anchor {
    scroll-margin-top: 110px;
    padding-right: clamp(16px, 2vw, 24px);
  }

  .setup-shell,
  .settings-panel {
    padding: clamp(16px, 2.3vw, 28px);
  }

  .setup-head {
    margin-bottom: 18px;
  }

  .training-mode-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 18px;
  }

  .training-mode-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    min-height: 112px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: pointer;
    padding: 16px;
    text-align: left;
    transition: background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out),
      transform var(--motion-normal) var(--ease-out);
  }

  .training-mode-card:hover,
  .training-mode-card--active {
    border-color: color-mix(in srgb, var(--accent) 52%, var(--glass-border));
    background: var(--surface-raised);
    box-shadow: inset 0 1px 0 var(--inner-highlight),
      0 14px 32px color-mix(in srgb, var(--accent) 14%, transparent);
    transform: translateY(-1px);
  }

  .training-mode-card::after {
    content: '';
    position: absolute;
    top: 16px;
    right: 16px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px var(--glass-border-strong);
  }

  .training-mode-card--active::after {
    background: var(--accent-2);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent);
  }

  .training-mode-card span {
    display: grid;
    gap: 7px;
    min-width: 0;
  }

  .training-mode-card strong {
    color: var(--text-primary);
    font-size: 17px;
    font-weight: 950;
  }

  .training-mode-card small {
    max-width: 56ch;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.45;
  }

  .training-mode-card em {
    align-self: end;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 11px;
    font-style: normal;
    font-weight: 900;
    padding: 6px 9px;
    white-space: nowrap;
  }

  .context-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }

  .context-column,
  .manual-source-stack,
  .candidate-stack,
  .settings-stack,
  .advanced-content,
  .question-options {
    display: grid;
    gap: 14px;
    min-width: 0;
  }

  .context-column--candidate {
    border-left: 1px solid var(--glass-border);
    padding-left: clamp(16px, 2vw, 24px);
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 18px;
  }

  .panel-head--compact {
    margin-bottom: 0;
  }

  .panel-label,
  .field-label {
    margin: 0 0 8px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1,
  h2 {
    color: var(--text-primary);
    font-size: clamp(22px, 2.35vw, 30px);
    line-height: 1.08;
  }

  h3 {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 900;
  }

  .panel-helper {
    max-width: 42ch;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.5;
    text-align: right;
  }

  .help-button {
    display: inline-grid;
    place-items: center;
    min-width: 36px;
    height: 36px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: help;
    transition: border-color var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out);
  }

  .help-button:hover,
  .help-button:focus-visible {
    border-color: var(--focus-ring);
    background: var(--surface-raised);
    color: var(--text-primary);
    outline: 0;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--focus-ring) 18%, transparent);
  }

  .source-tabs,
  .segmented {
    display: grid;
    gap: 8px;
    padding: 6px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--surface-soft);
  }

  .source-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 14px;
  }

  .segmented {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .segmented--compact {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .source-tab,
  .segment {
    min-width: 0;
    min-height: 52px;
    border: 0;
    border-radius: 14px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-weight: 900;
    overflow: hidden;
    padding: 0 12px;
    text-align: center;
    text-overflow: ellipsis;
    transition: background var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out),
      transform var(--motion-normal) var(--ease-out);
    white-space: nowrap;
  }

  .source-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 14px;
  }

  .segment {
    display: grid;
    place-items: center;
    gap: 2px;
    font-size: 13px;
    white-space: normal;
  }

  .segment small {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 800;
  }

  .source-tab svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
  }

  .source-tab--active,
  .segment--active {
    background: var(--surface-raised);
    color: var(--text-primary);
    box-shadow: inset 0 1px 0 var(--inner-highlight),
      0 12px 26px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .source-hint,
  .field-hint,
  .file-note,
  .parameter-copy p,
  .toggle-copy small,
  .focus-chip small,
  .advanced-panel summary small {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.45;
  }

  .source-hint {
    margin: 12px 0 14px;
  }

  .field {
    display: grid;
    gap: 8px;
  }

  .field label,
  .field-label {
    display: block;
  }

  .field label {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 900;
  }

  .input-shell {
    position: relative;
  }

  .input-shell svg {
    position: absolute;
    top: 50%;
    left: 14px;
    z-index: 2;
    width: 17px;
    height: 17px;
    color: var(--text-secondary);
    transform: translateY(-50%);
  }

  .input-shell .text-control {
    padding-left: 42px;
  }

  .text-control {
    width: 100%;
    min-height: 52px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
    color: var(--text-primary);
    outline: 0;
    padding: 14px 15px;
    transition: background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out);
  }

  .text-control::placeholder {
    color: var(--text-muted);
  }

  .text-control:focus {
    border-color: var(--focus-ring);
    background: var(--surface-raised);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--focus-ring) 18%, transparent);
  }

  textarea.text-control {
    min-height: 136px;
    resize: vertical;
  }

  .role-combobox,
  .role-anchor {
    display: block;
    min-width: 0;
  }

  .context-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .context-tag,
  .secondary-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 850;
    padding: 0 12px;
    transition: background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out);
  }

  .context-tag__x {
    font-size: 14px;
    line-height: 1;
    color: var(--accent-2);
  }

  .context-tag:hover,
  .context-tag--active,
  .secondary-button:hover {
    border-color: color-mix(in srgb, var(--accent) 52%, var(--glass-border));
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .context-tag--active {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .custom-context-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .field-hint--warning {
    color: var(--danger);
    font-weight: 800;
  }

  .role-menu {
    z-index: 50;
    width: min(var(--reka-combobox-trigger-width, 520px), calc(100vw - 28px));
    max-height: min(
      var(--reka-combobox-content-available-height, 320px),
      320px
    );
    overflow: hidden;
    padding: 6px;
  }

  .role-menu-viewport {
    display: grid;
    gap: 3px;
    max-height: 304px;
    overflow-x: hidden;
    overflow-y: auto;
    padding-right: 2px;
    scrollbar-color: var(--glass-border-strong) transparent;
    scrollbar-width: thin;
  }

  .role-option {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 46px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    outline: 0;
    padding: 8px 12px;
    text-align: left;
    user-select: none;
  }

  .role-option:hover,
  .role-option[data-highlighted] {
    background: var(--surface-raised);
  }

  .role-option--custom {
    border: 1px dashed var(--glass-border);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .role-option span {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .role-option strong,
  .role-option small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-option small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .role-option-check {
    width: 16px;
    height: 16px;
    color: var(--accent-2);
  }

  .role-empty {
    padding: 16px 12px;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .file-upload {
    position: relative;
    min-height: 112px;
  }

  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .file-drop {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 112px;
    border: 1px dashed var(--glass-border-strong);
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-soft));
    color: var(--text-secondary);
    cursor: pointer;
    padding: 16px;
    transition: border-color var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out);
  }

  .file-input:focus-visible + .file-drop,
  .file-drop:hover {
    border-color: var(--focus-ring);
    background: var(--surface-raised);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--focus-ring) 14%, transparent);
  }

  .file-drop__content {
    justify-content: flex-start;
    gap: 14px;
    min-width: 0;
  }

  .file-drop__icon {
    display: inline-grid;
    flex: 0 0 auto;
    width: 46px;
    height: 46px;
    place-items: center;
    border: 1px solid var(--glass-border);
    border-radius: 14px;
    background: var(--button-bg);
    color: var(--button-text);
    box-shadow: var(--button-shadow);
  }

  .file-drop__copy {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .file-drop__copy strong,
  .file-drop__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-drop__copy strong {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 900;
  }

  .file-drop__copy small {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.35;
  }

  .resume-preview {
    overflow: hidden;
    min-height: 200px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: color-mix(
      in srgb,
      var(--surface-raised) 72%,
      var(--surface-soft)
    );
    box-shadow: inset 0 1px 0 var(--inner-highlight);
  }

  .resume-preview__head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    padding: 14px 16px;
    border-bottom: 1px solid var(--glass-border);
  }

  .resume-preview__title,
  .resume-preview__empty {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .resume-preview__head span {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .resume-preview__head strong,
  .resume-preview__empty strong {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 900;
  }

  .resume-preview__head small,
  .resume-preview__empty p {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.4;
  }

  .resume-preview__actions {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
  }

  .resume-preview__clear {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 900;
    padding: 0 10px;
  }

  .resume-preview__body,
  .resume-preview__skeleton {
    padding: 16px;
  }

  .resume-preview__body {
    display: grid;
    gap: 10px;
    max-height: 294px;
    overflow-y: auto;
    scrollbar-color: var(--glass-border-strong) transparent;
    scrollbar-width: thin;
  }

  .resume-preview__heading {
    margin-top: 6px;
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .resume-preview__heading:first-child {
    margin-top: 0;
  }

  .resume-preview__paragraph,
  .resume-preview__list {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.55;
  }

  .resume-preview__paragraph {
    margin: 0;
  }

  .resume-preview__list {
    display: grid;
    gap: 6px;
    margin: 0;
    padding-left: 18px;
  }

  .resume-preview__empty {
    align-content: center;
    min-height: 160px;
    padding: 20px 16px;
  }

  .parameter-group {
    display: grid;
    grid-template-columns: minmax(170px, 0.25fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
  }

  .parameter-copy {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .goal-grid,
  .focus-chip-grid,
  .candidate-option-grid,
  .custom-questions-grid {
    display: grid;
    gap: 8px;
  }

  .goal-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .focus-chip-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .candidate-option-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .goal-card,
  .focus-chip {
    position: relative;
    display: grid;
    gap: 5px;
    min-height: 96px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: pointer;
    padding: 14px;
    text-align: left;
    transition: background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out),
      transform var(--motion-normal) var(--ease-out);
  }

  .focus-chip {
    min-height: 92px;
  }

  .goal-card::after,
  .focus-chip::after {
    content: '';
    position: absolute;
    top: 14px;
    right: 14px;
    width: 9px;
    height: 9px;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px var(--glass-border-strong);
  }

  .goal-card strong,
  .focus-chip strong {
    color: var(--text-primary);
    font-size: 14px;
    padding-right: 16px;
  }

  .goal-card span,
  .goal-card small {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.35;
  }

  .goal-card small {
    font-family: var(--font-mono);
    font-weight: 900;
  }

  .goal-card--locked {
    cursor: pointer;
    opacity: 0.62;
  }

  .goal-card--locked:hover {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--glass-border));
    background: var(--surface-soft);
    box-shadow: none;
    transform: none;
    opacity: 0.82;
  }

  .goal-card--locked::after {
    display: none;
  }

  .goal-card__lock {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    justify-self: start;
    margin-top: 4px;
    border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--glass-border));
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-soft));
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0;
    padding: 3px 8px;
    text-transform: uppercase;
  }

  .goal-card__lock svg {
    width: 11px;
    height: 11px;
  }

  .goal-locked-hint {
    grid-column: 1 / -1;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.45;
  }

  .goal-locked-hint a {
    color: var(--accent-2);
    font-weight: 900;
    white-space: nowrap;
  }

  .goal-card:hover,
  .goal-card--active,
  .focus-chip:hover,
  .focus-chip--active {
    border-color: color-mix(in srgb, var(--accent) 52%, var(--glass-border));
    background: var(--surface-raised);
    box-shadow: inset 0 1px 0 var(--inner-highlight),
      0 14px 30px color-mix(in srgb, var(--accent) 16%, transparent);
    transform: translateY(-1px);
  }

  .goal-card--active::after,
  .focus-chip--active::after {
    background: var(--accent-2);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent),
      0 0 22px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .advanced-panel {
    overflow: hidden;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
  }

  .advanced-panel summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
    cursor: pointer;
    list-style: none;
    padding: 16px;
  }

  .advanced-panel summary::-webkit-details-marker {
    display: none;
  }

  .advanced-panel summary span {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .advanced-panel summary strong {
    color: var(--text-primary);
    font-size: 15px;
  }

  .advanced-panel__chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    transition: transform var(--motion-normal) var(--ease-out);
  }

  .advanced-panel__chevron svg {
    width: 18px;
    height: 18px;
  }

  .advanced-panel[open] .advanced-panel__chevron {
    transform: rotate(180deg);
  }

  .advanced-content {
    border-top: 1px solid var(--glass-border);
    padding: 16px;
  }

  .custom-questions-panel {
    display: grid;
    gap: 14px;
  }

  .custom-questions-grid {
    grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
    align-items: start;
  }

  .interviewer-scenario-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .scenario-card {
    display: grid;
    gap: 6px;
    min-width: 0;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: pointer;
    padding: 13px;
    text-align: left;
    transition: border-color var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      transform var(--motion-normal) var(--ease-out);
  }

  .scenario-card:hover,
  .scenario-card--active {
    border-color: color-mix(in srgb, var(--accent) 52%, var(--glass-border));
    background: var(--surface-raised);
    transform: translateY(-1px);
  }

  .scenario-card--active {
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--accent) 28%, transparent);
  }

  .scenario-card strong {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 900;
  }

  .scenario-card span,
  .scenario-card small,
  .scenario-note {
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.45;
  }

  .scenario-note {
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    padding: 14px;
  }

  .toggle-option {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    cursor: pointer;
    padding: 14px;
  }

  .toggle-option input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
  }

  .toggle-switch {
    position: relative;
    width: 46px;
    height: 26px;
    border: 1px solid var(--glass-border-strong);
    border-radius: 999px;
    background: var(--surface-raised);
  }

  .toggle-switch::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: var(--text-secondary);
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out);
  }

  .toggle-option input:checked + .toggle-switch {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--glass-border));
    background: color-mix(in srgb, var(--accent) 22%, var(--surface-raised));
  }

  .toggle-option input:checked + .toggle-switch::after {
    background: var(--accent-2);
    transform: translateX(20px);
  }

  .toggle-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .toggle-copy strong {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 900;
  }

  .error-box {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    border-color: color-mix(in srgb, var(--danger) 42%, var(--glass-border));
    padding: 16px 18px;
  }

  .error-box p {
    color: var(--danger);
    font-weight: 900;
  }

  .error-box a {
    color: var(--accent-2);
    font-weight: 900;
  }

  .sticky-start-bar {
    position: sticky;
    bottom: max(12px, env(safe-area-inset-bottom));
    z-index: 18;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
    padding: 14px;
    backdrop-filter: blur(var(--glass-blur));
  }

  .sticky-start-bar__copy,
  .sticky-start-bar__actions {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .sticky-start-bar__copy p {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 750;
  }

  .summary-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .summary-chips span {
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 850;
    padding: 6px 10px;
  }

  .sticky-start-bar__actions {
    justify-items: end;
  }

  .actions-hint {
    max-width: 44ch;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 800;
    line-height: 1.45;
    text-align: right;
  }

  .start-button {
    min-width: min(100%, 300px);
  }

  .actions-hint--locked {
    color: var(--accent-2);
  }

  .start-button__diamond {
    margin-right: 2px;
    font-size: 15px;
    line-height: 1;
  }

  .interview-start-overlay {
    position: fixed;
    inset: 0;
    z-index: 240;
    display: grid;
    place-items: center;
    padding: clamp(18px, 4vw, 42px);
    background: color-mix(in srgb, var(--app-bg) 68%, transparent);
    backdrop-filter: blur(18px);
  }

  .interview-start-card {
    display: grid;
    grid-template-columns: minmax(150px, 0.34fr) minmax(0, 1fr);
    gap: clamp(18px, 3vw, 34px);
    align-items: center;
    width: min(900px, 100%);
    min-height: clamp(280px, 42vh, 420px);
    padding: clamp(22px, 3vw, 36px);
  }

  .interview-start-visual {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 190px;
  }

  .interview-start-ring,
  .interview-start-core {
    position: absolute;
    border-radius: 999px;
  }

  .interview-start-ring {
    width: 150px;
    height: 150px;
    border: 1px solid color-mix(in srgb, var(--accent-2) 56%, transparent);
    box-shadow: inset 0 0 34px
      color-mix(in srgb, var(--accent) 16%, transparent);
    animation: interview-start-orbit 3.8s var(--ease-out) infinite;
  }

  .interview-start-ring::before,
  .interview-start-ring::after {
    content: '';
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: inherit;
    background: var(--accent-2);
    box-shadow: 0 0 18px color-mix(in srgb, var(--accent-2) 72%, transparent);
  }

  .interview-start-ring::before {
    top: 18px;
    right: 20px;
  }

  .interview-start-ring::after {
    left: 20px;
    bottom: 22px;
    background: var(--accent);
  }

  .interview-start-ring--slow {
    width: 112px;
    height: 112px;
    border-color: color-mix(in srgb, var(--accent) 52%, transparent);
    animation-direction: reverse;
    animation-duration: 5.4s;
  }

  .interview-start-core {
    width: 72px;
    height: 72px;
    background: radial-gradient(
        circle at 35% 28%,
        color-mix(in srgb, var(--inner-highlight) 84%, transparent),
        transparent 28%
      ),
      linear-gradient(135deg, var(--accent), var(--accent-2));
    box-shadow: inset 0 1px 0
        color-mix(in srgb, var(--inner-highlight) 70%, transparent),
      0 18px 40px color-mix(in srgb, var(--accent) 28%, transparent);
    animation: interview-start-core-pulse 1.8s var(--ease-out) infinite;
  }

  .interview-start-content {
    display: grid;
    gap: 14px;
    min-width: 0;
  }

  .interview-start-content h2 {
    color: var(--text-primary);
    font-size: clamp(22px, 2.4vw, 32px);
    line-height: 1.05;
  }

  .interview-start-content > p:not(.panel-label) {
    max-width: 58ch;
    color: var(--text-secondary);
    line-height: 1.55;
  }

  .interview-start-steps {
    display: grid;
    gap: 10px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  .interview-start-steps li {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-secondary);
    font-weight: 800;
    opacity: 0.64;
  }

  .interview-start-steps__item--active {
    color: var(--text-primary);
    opacity: 1;
  }

  .interview-start-steps span {
    position: relative;
    flex: 0 0 36px;
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-muted) 22%, transparent);
  }

  .interview-start-steps span::after {
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      transparent,
      var(--accent-2),
      transparent
    );
    animation: interview-start-step 1.6s var(--ease-out) infinite;
  }

  @keyframes interview-start-orbit {
    0% {
      transform: rotate(0deg) scale(0.96);
      opacity: 0.72;
    }
    50% {
      transform: rotate(180deg) scale(1.04);
      opacity: 1;
    }
    100% {
      transform: rotate(360deg) scale(0.96);
      opacity: 0.72;
    }
  }

  @keyframes interview-start-core-pulse {
    0%,
    100% {
      transform: scale(0.94);
      opacity: 0.84;
    }
    50% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes interview-start-step {
    100% {
      transform: translateX(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .interview-start-ring,
    .interview-start-core,
    .interview-start-steps span::after {
      animation: none;
    }
  }

  @media (max-width: 1365px) {
    .context-grid,
    .custom-questions-grid {
      grid-template-columns: 1fr;
    }

    .interviewer-scenario-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .context-column--candidate {
      border-left: 0;
      border-top: 1px solid var(--glass-border);
      padding-left: 0;
      padding-top: 18px;
    }

    .focus-chip-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .sticky-start-bar {
      bottom: calc(86px + env(safe-area-inset-bottom));
    }
  }

  @media (max-width: 760px) {
    .interview-page {
      gap: 14px;
      padding-bottom: calc(132px + env(safe-area-inset-bottom));
    }

    .setup-shell,
    .settings-panel {
      padding: 16px;
    }

    .panel-head,
    .resume-preview__head,
    .error-box {
      flex-direction: column;
      align-items: flex-start;
    }

    .panel-head--compact {
      flex-direction: row;
      align-items: flex-start;
    }

    .panel-helper {
      text-align: left;
    }

    .goal-grid,
    .focus-chip-grid,
    .training-mode-grid,
    .candidate-option-grid,
    .segmented,
    .segmented--compact,
    .parameter-group,
    .custom-questions-grid,
    .sticky-start-bar {
      grid-template-columns: 1fr;
    }

    .goal-card,
    .focus-chip {
      min-height: auto;
    }

    .custom-context-row {
      grid-template-columns: 1fr;
    }

    .resume-preview__actions {
      width: 100%;
      justify-content: space-between;
    }

    .sticky-start-bar__actions,
    .start-button {
      width: 100%;
      justify-items: stretch;
    }

    .sticky-start-bar {
      bottom: calc(72px + env(safe-area-inset-bottom));
      gap: 8px;
      padding: 10px;
    }

    .sticky-start-bar__copy {
      gap: 0;
    }

    .sticky-start-bar__copy p {
      display: none;
    }

    .sticky-start-bar .summary-chips {
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
    }

    .sticky-start-bar .summary-chips::-webkit-scrollbar {
      display: none;
    }

    .sticky-start-bar .summary-chips span {
      flex: 0 0 auto;
      padding: 5px 9px;
      font-size: 11px;
    }

    .actions-hint {
      max-width: none;
      text-align: left;
      font-size: 12px;
    }

    .interview-start-card {
      grid-template-columns: 1fr;
      min-height: 0;
    }

    .interview-start-visual {
      min-height: 150px;
    }
  }

  @media (max-width: 640px) {
    .sticky-start-bar {
      /* На узких экранах прокручивается .workspace: её нижняя граница уже
         оставляет место для нижней навигации. Не резервируем её высоту
         повторно, иначе панель зависает слишком высоко над кнопками. */
      bottom: 0;
    }

    .interviewer-scenario-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 480px) {
    .source-tabs {
      grid-template-columns: 1fr;
    }

    .source-tab {
      justify-content: flex-start;
      padding: 0 14px;
      text-align: left;
    }

    .advanced-panel summary {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }
</style>

<style>
  /* Reka Combobox рендерит меню через Teleport, поэтому эти правила не scoped. */
  .role-menu {
    z-index: 80;
    width: min(
      var(--reka-combobox-trigger-width, 520px),
      calc(100vw - 28px)
    ) !important;
    max-height: min(
      var(--reka-combobox-content-available-height, 320px),
      calc(100dvh - 140px),
      320px
    ) !important;
    overflow: hidden !important;
    padding: 6px;
  }

  .role-menu-viewport {
    display: grid;
    gap: 3px;
    max-height: min(
      calc(var(--reka-combobox-content-available-height, 320px) - 16px),
      calc(100dvh - 156px),
      304px
    ) !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
    padding-right: 4px;
    scrollbar-color: var(--glass-border-strong) transparent;
    scrollbar-width: thin;
  }

  .role-menu .role-menu-viewport::-webkit-scrollbar {
    display: block !important;
    width: 6px;
  }

  .role-menu .role-menu-viewport::-webkit-scrollbar-track {
    background: transparent;
  }

  .role-menu .role-menu-viewport::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--glass-border-strong);
  }

  .role-option {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 46px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    outline: 0;
    padding: 8px 12px;
    text-align: left;
    user-select: none;
  }

  .role-option:hover,
  .role-option[data-highlighted] {
    background: var(--surface-raised);
  }

  .role-option--custom {
    border: 1px dashed var(--glass-border);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .role-option span {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .role-option strong,
  .role-option small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-option small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .role-option-check {
    width: 16px;
    height: 16px;
    color: var(--accent-2);
  }

  .role-empty {
    padding: 16px 12px;
    color: var(--text-secondary);
    font-size: 13px;
  }
</style>
