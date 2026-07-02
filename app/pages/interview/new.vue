<script setup lang="ts">
  import {
    ArrowRightIcon,
    Cross2Icon,
    CubeIcon,
    FileTextIcon,
    Link2Icon,
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
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import VoiceTextarea from '@/app/components/form/VoiceTextarea.vue';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import {
    buildManualInterviewSource,
    isManualInterviewSourceReady,
    resolveProfessionSelection,
  } from '@/app/utils/interviewSource';
  import { buildResumePreviewBlocks } from '@/app/utils/resumePreview';

  type SourceMode = 'hh_url' | 'manual';
  type InterviewLevel = CreateInterviewSessionRequest['level'];
  type InterviewerMode = CreateInterviewSessionRequest['interviewerMode'];
  type InterviewSessionGoal = CreateInterviewSessionRequest['sessionGoal'];
  type QuestionSourceMode = NonNullable<
    CreateInterviewSessionRequest['questionSourceMode']
  >;
  type InterviewFocus = NonNullable<CreateInterviewSessionRequest['focus']>;

  interface RoleOption {
    role: string;
    specialization: string;
    group: string;
    custom?: boolean;
  }

  const MAX_RESUME_CONTEXT_CHARS = 15_000;

  const { t } = useI18n();
  const route = useRoute();
  const api = useAPI();

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
  const errorMessage = ref('');
  const errorCode = ref('');
  const isExtractingQuestionsFile = ref(false);
  const rolePickerOpen = ref(false);
  const rolePickerRequested = ref(false);
  const roleSearchTerm = ref('');
  const selectedRoleOption = ref<RoleOption | null>(null);
  const resumeFileName = ref('');
  const resumeExtractedText = ref('');
  const questionsFileName = ref('');
  const questionsFileText = ref('');

  const form = reactive({
    hhUrl: '',
    vacancyText: '',
    vacancyTitle: '',
    professionRole: String(route.query.role || ''),
    specialization: '',
    resumeNotes: '',
    level: (route.query.level === 'junior' ||
    route.query.level === 'middle' ||
    route.query.level === 'senior'
      ? route.query.level
      : 'middle') as InterviewLevel,
    sessionGoal: 'standard' as InterviewSessionGoal,
    questionSourceMode: 'mixed' as QuestionSourceMode,
    customQuestionsText: '',
    focus: focusFromQuery(route.query.focus) as InterviewFocus | null,
    skipCandidateContext: false,
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

  const popularRoles: RoleOption[] = [
    {
      role: 'Менеджер по продажам',
      specialization: 'B2B, переговоры, план продаж',
      group: 'Продажи',
    },
    {
      role: 'Руководитель отдела продаж',
      specialization: 'Команда, воронка, прогноз',
      group: 'Продажи',
    },
    {
      role: 'Менеджер по продукту',
      specialization: 'Метрики, roadmap, discovery',
      group: 'Продукт',
    },
    {
      role: 'Project manager',
      specialization: 'Сроки, риски, коммуникации',
      group: 'Управление',
    },
    {
      role: 'Маркетолог',
      specialization: 'Performance, аналитика, контент',
      group: 'Маркетинг',
    },
    {
      role: 'HR-специалист',
      specialization: 'Подбор, адаптация, HR-процессы',
      group: 'HR',
    },
    {
      role: 'Бухгалтер',
      specialization: 'Первичка, налоги, отчетность',
      group: 'Финансы',
    },
    {
      role: 'Операционный менеджер',
      specialization: 'Процессы, контроль, регламенты',
      group: 'Операции',
    },
    {
      role: 'Frontend-разработчик',
      specialization: 'Vue, React, производительность',
      group: 'IT',
    },
    {
      role: 'Backend-разработчик',
      specialization: 'API, базы данных, архитектура',
      group: 'IT',
    },
    {
      role: 'Data analyst',
      specialization: 'SQL, продуктовые метрики, BI',
      group: 'Аналитика',
    },
    {
      role: 'UX/UI-дизайнер',
      specialization: 'Исследования, прототипы, дизайн-система',
      group: 'Дизайн',
    },
  ];

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

  const focusOptions: Array<{ value: InterviewFocus | null; label: string }> = [
    { value: null, label: 'interview.focus.mixed' },
    { value: 'hr_screening', label: 'interview.focus.hrScreening' },
    { value: 'professional', label: 'interview.focus.professional' },
    { value: 'behavioral', label: 'interview.focus.behavioral' },
    { value: 'salary_negotiation', label: 'interview.focus.salaryNegotiation' },
  ];

  const sessionGoalOptions: Array<{
    value: InterviewSessionGoal;
    title: string;
    description: string;
    meta: string;
  }> = [
    {
      value: 'quick',
      title: 'interview.goal.quick.title',
      description: 'interview.goal.quick.description',
      meta: 'interview.goal.quick.meta',
    },
    {
      value: 'standard',
      title: 'interview.goal.standard.title',
      description: 'interview.goal.standard.description',
      meta: 'interview.goal.standard.meta',
    },
    {
      value: 'deep',
      title: 'interview.goal.deep.title',
      description: 'interview.goal.deep.description',
      meta: 'interview.goal.deep.meta',
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
      const exactMatch = popularRoles.some(
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
      ? popularRoles.filter((item) =>
          `${item.role} ${item.specialization} ${item.group}`
            .toLowerCase()
            .includes(query)
        )
      : popularRoles;
    return [...options, customRoleOption.value].filter(
      (option): option is RoleOption => Boolean(option)
    );
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
    if (sourceMode.value === 'hh_url') return t('interview.new.sourceHint.hh');
    return t('interview.new.sourceHint.manual');
  });

  const customQuestionsCombinedText = computed(() =>
    form.customQuestionsText.trim()
  );

  const customOnlyEnabled = computed({
    get: () => form.questionSourceMode === 'custom',
    set: (enabled: boolean) => {
      form.questionSourceMode = enabled ? 'custom' : 'mixed';
    },
  });

  const resumeContextText = computed(() => {
    const parts: string[] = [];
    const extracted = resumeExtractedText.value.trim();
    const notes = form.resumeNotes.trim();

    if (extracted) {
      parts.push(
        `Резюме из файла ${
          resumeFileName.value ? `"${resumeFileName.value}"` : ''
        }:\n${extracted}`
      );
    }

    if (notes) {
      parts.push(`Дополнительно от кандидата:\n${notes}`);
    }

    return trimResumeContext(parts.join('\n\n'));
  });

  const resumePreviewBlocks = computed(() =>
    buildResumePreviewBlocks(resumeExtractedText.value)
  );

  const resumePreviewMeta = computed(() => {
    const count = resumeExtractedText.value.length;
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

  const candidateContextReady = computed(
    () => resumeContextText.value.trim().length >= 10
  );

  function trimResumeContext(value: string): string {
    if (value.length <= MAX_RESUME_CONTEXT_CHARS) return value;
    return value.slice(0, MAX_RESUME_CONTEXT_CHARS - 96).trimEnd();
  }

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
    if (!candidateContextReady.value && !form.skipCandidateContext) {
      return t('interview.new.actions.needCandidateContext');
    }
    return '';
  });

  const canSubmit = computed(
    () => !isSubmitting.value && !submitBlockerMessage.value
  );

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
    form.specialization = selection.specialization;
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

  function buildPayload(): CreateInterviewSessionRequestInput {
    const base = {
      resumeText: resumeContextText.value || undefined,
      role: form.professionRole.trim() || undefined,
      level: form.level,
      sessionGoal: form.sessionGoal,
      questionSourceMode: form.questionSourceMode,
      focus: form.focus ?? undefined,
      customQuestionsText: customQuestionsCombinedText.value || undefined,
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
        specialization: form.specialization,
        vacancyText: form.vacancyText,
        vacancyTitle: form.vacancyTitle,
      }),
    };
  }

  function extractApiError(error: unknown): string {
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (
        error as { data?: { error?: { code?: string; message?: string } } }
      ).data;
      errorCode.value = data?.error?.code || '';
      return data?.error?.message || t('interview.common.unknownError');
    }
    errorCode.value = '';
    return error instanceof Error
      ? error.message
      : t('interview.common.unknownError');
  }

  async function onResumeFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    resumeFileName.value = file.name;
    resumeExtractedText.value = '';
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
      resumeExtractedText.value = response.text;
      resumeFileName.value = response.fileName || file.name;
    } catch (err) {
      resumeFileName.value = '';
      resumeExtractedText.value = '';
      errorMessage.value = extractApiError(err);
    } finally {
      isExtractingResume.value = false;
      input.value = '';
    }
  }

  function clearResumeFile() {
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

  async function submit() {
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
</script>

<template>
  <form class="interview-page app-page" @submit.prevent="submit">
    <section class="context-panel glass-frame">
      <div class="panel-head">
        <div>
          <p class="panel-label">{{ t('interview.new.context.kicker') }}</p>
          <h2>{{ t('interview.new.context.title') }}</h2>
        </div>
      </div>

      <div class="context-grid">
        <article class="context-column">
          <div class="panel-head panel-head--compact">
            <div>
              <p class="panel-label">{{ t('interview.new.source.kicker') }}</p>
              <h3>{{ t('interview.new.source.title') }}</h3>
            </div>
            <span class="source-help" v-tooltip="t('interview.new.sourceHelp')">
              <QuestionMarkCircledIcon aria-hidden="true" />
            </span>
          </div>

          <div class="source-tabs" role="tablist">
            <button
              v-for="tab in sourceTabs"
              :key="tab.value"
              type="button"
              class="source-tab"
              :class="{ 'source-tab--active': sourceMode === tab.value }"
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
                placeholder="https://company.ru/careers/product-manager"
              />
            </div>
          </div>

          <div v-else class="stack manual-source-stack">
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
                          <small>{{ option.specialization }}</small>
                        </span>
                        <em>{{ option.group }}</em>
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

            <div class="field">
              <label for="specialization">{{
                t('interview.new.fields.specialization')
              }}</label>
              <input
                id="specialization"
                v-model="form.specialization"
                class="text-control"
                type="text"
                :placeholder="t('interview.new.placeholders.specialization')"
              />
            </div>

            <div class="field">
              <label for="vacancy-text">{{
                t('interview.new.fields.vacancyText')
              }}</label>
              <VoiceTextarea
                id="vacancy-text"
                v-model="form.vacancyText"
                :rows="6"
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

        <article class="context-column context-column--candidate">
          <div class="panel-head panel-head--compact">
            <div>
              <p class="panel-label">{{ t('interview.new.resume.kicker') }}</p>
              <h3>{{ t('interview.new.resume.title') }}</h3>
            </div>
          </div>

          <p class="source-hint">{{ t('interview.new.resume.helper') }}</p>

          <div class="candidate-stack">
            <div class="field">
              <label for="resume-file">{{
                t('interview.new.resume.file')
              }}</label>
              <div class="file-upload file-upload--compact">
                <input
                  id="resume-file"
                  class="file-input"
                  type="file"
                  accept=".pdf,.txt,.md,.png,.jpg,.jpeg,text/plain,text/markdown,application/pdf,image/png,image/jpeg"
                  :disabled="isExtractingResume"
                  @change="onResumeFileChange"
                />
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
                        {{ t('interview.new.resume.uploadTitle') }}
                      </strong>
                      <small>
                        {{
                          resumeFileName || t('interview.new.resume.uploadHint')
                        }}
                      </small>
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <section
              class="resume-preview"
              :class="{ 'resume-preview--empty': !resumePreviewBlocks.length }"
            >
              <div class="resume-preview__head">
                <div class="resume-preview__title">
                  <span>{{ t('interview.new.resume.previewKicker') }}</span>
                  <strong>{{ t('interview.new.resume.previewTitle') }}</strong>
                </div>
                <div class="resume-preview__actions">
                  <small>{{ resumePreviewMeta }}</small>
                  <button
                    v-if="resumeFileName || resumeExtractedText"
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

              <div
                v-else-if="resumePreviewBlocks.length"
                class="resume-preview__body"
              >
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

              <div v-else class="resume-preview__empty">
                <strong>{{
                  t('interview.new.resume.previewEmptyTitle')
                }}</strong>
                <p>{{ t('interview.new.resume.previewEmptyHint') }}</p>
              </div>
            </section>

            <div class="field">
              <label for="resume-notes">{{
                t('interview.new.resume.notes')
              }}</label>
              <VoiceTextarea
                id="resume-notes"
                v-model="form.resumeNotes"
                :rows="4"
                :placeholder="t('interview.new.placeholders.resumeText')"
              />
            </div>

            <label
              v-if="!candidateContextReady"
              class="skip-option"
              :class="{ 'skip-option--active': form.skipCandidateContext }"
            >
              <input v-model="form.skipCandidateContext" type="checkbox" />
              <span class="toggle-switch" aria-hidden="true"></span>
              <span class="toggle-copy">
                <strong>{{ t('interview.new.candidate.skip') }}</strong>
                <small>{{ t('interview.new.candidate.skipHint') }}</small>
              </span>
            </label>
          </div>
        </article>
      </div>
    </section>

    <section class="custom-questions-panel glass-frame glass-frame--soft">
      <div class="panel-head">
        <div>
          <p class="panel-label">
            {{ t('interview.new.customQuestions.kicker') }}
          </p>
          <h2>{{ t('interview.new.customQuestions.title') }}</h2>
        </div>
        <span
          class="source-help"
          v-tooltip="t('interview.new.customQuestions.tooltip')"
        >
          <QuestionMarkCircledIcon aria-hidden="true" />
        </span>
      </div>

      <div class="custom-questions-grid">
        <div class="field">
          <label for="custom-questions">{{
            t('interview.new.customQuestions.label')
          }}</label>
          <VoiceTextarea
            id="custom-questions"
            v-model="form.customQuestionsText"
            :rows="5"
            :placeholder="t('interview.new.customQuestions.placeholder')"
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
              />
              <label
                class="file-drop file-drop--compact button-loader-host"
                for="custom-questions-file"
              >
                <ButtonLoader v-if="isExtractingQuestionsFile" />
                <span
                  class="button-loader-content file-drop__content"
                  :class="{
                    'button-loader-content--loading': isExtractingQuestionsFile,
                  }"
                >
                  <span class="file-drop__icon" aria-hidden="true">
                    <FileTextIcon />
                  </span>
                  <span class="file-drop__copy">
                    <strong>
                      {{ t('interview.new.customQuestions.uploadTitle') }}
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

          <label class="toggle-option">
            <input v-model="customOnlyEnabled" type="checkbox" />
            <span class="toggle-switch" aria-hidden="true"></span>
            <span class="toggle-copy">
              <strong>{{ t('interview.new.customQuestions.onlyMine') }}</strong>
              <small>{{
                t('interview.new.customQuestions.onlyMineHint')
              }}</small>
            </span>
          </label>

          <div class="question-mode-note">
            <strong>{{
              t('interview.new.customQuestions.defaultMode')
            }}</strong>
            <span>{{
              t('interview.new.customQuestions.defaultModeHint')
            }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-panel panel glass-frame glass-frame--soft">
      <div class="panel-head">
        <div>
          <p class="panel-label">{{ t('interview.new.params.kicker') }}</p>
          <h2>{{ t('interview.new.params.title') }}</h2>
        </div>
      </div>

      <div class="parameter-stack parameter-stack--settings">
        <section class="parameter-group">
          <div>
            <h3>{{ t('interview.new.fields.level') }}</h3>
          </div>
          <div class="segmented segmented--cards" role="radiogroup">
            <button
              v-for="option in levelOptions"
              :key="option.value"
              type="button"
              class="segment"
              :class="{ 'segment--active': form.level === option.value }"
              @click="form.level = option.value"
            >
              <strong>
                <span>{{ t(option.label) }}</span>
                <small>({{ option.code }})</small>
              </strong>
            </button>
          </div>
        </section>

        <section class="parameter-group">
          <div>
            <h3>{{ t('interview.new.fields.interviewerMode') }}</h3>
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
              @click="form.interviewerMode = option.value"
            >
              {{ t(option.label) }}
            </button>
          </div>
        </section>

        <section class="parameter-group">
          <div>
            <h3>{{ t('interview.new.fields.focus') }}</h3>
            <p>{{ t('interview.new.fields.focusHint') }}</p>
          </div>
          <div
            class="segmented segmented--compact segmented--focus"
            role="radiogroup"
          >
            <button
              v-for="option in focusOptions"
              :key="option.label"
              type="button"
              class="segment"
              :class="{ 'segment--active': form.focus === option.value }"
              @click="form.focus = option.value"
            >
              {{ t(option.label) }}
            </button>
          </div>
        </section>

        <section class="parameter-group parameter-group--wide">
          <div>
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
              }"
              @click="form.sessionGoal = option.value"
            >
              <strong>{{ t(option.title) }}</strong>
              <span>{{ t(option.description) }}</span>
              <small>{{ t(option.meta) }}</small>
            </button>
          </div>
        </section>
      </div>
    </section>

    <div v-if="errorMessage" class="error-box glass-frame">
      <p>{{ errorMessage }}</p>
      <NuxtLink v-if="errorCode === 'E_FORBIDDEN'" to="/pricing">
        {{ t('interview.new.limit.pricing') }}
      </NuxtLink>
    </div>

    <div class="actions">
      <p v-if="submitBlockerMessage && !isSubmitting" class="actions-hint">
        {{ submitBlockerMessage }}
      </p>
      <button
        class="primary-action start-button button-loader-host"
        type="submit"
        :disabled="!canSubmit"
      >
        <ButtonLoader v-if="isSubmitting" />
        <span
          class="button-loader-content"
          :class="{ 'button-loader-content--loading': isSubmitting }"
        >
          {{ t('interview.new.actions.start') }}
          <span class="primary-action__icon" aria-hidden="true">
            <ArrowRightIcon />
          </span>
        </span>
      </button>
    </div>

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
          <span class="interview-start-ring"></span>
          <span class="interview-start-ring interview-start-ring--slow"></span>
          <span class="interview-start-core"></span>
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
              :class="{ 'interview-start-steps__item--active': index === preparationStepIndex }"
            >
              <span></span>
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
  }

  .context-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 0.9fr);
    gap: clamp(16px, 2vw, 22px);
    align-items: start;
  }

  .context-column {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .context-column--candidate {
    border-left: 1px solid var(--glass-border);
    padding-left: clamp(16px, 2vw, 22px);
  }

  .panel,
  .context-panel,
  .settings-panel,
  .custom-questions-panel {
    padding: clamp(18px, 2.2vw, 26px);
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

  .panel-label {
    margin: 0 0 8px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    color: var(--text-primary);
    font-size: clamp(22px, 2.2vw, 30px);
    line-height: 1.08;
  }

  h3 {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 900;
  }

  .source-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 34px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--text-muted);
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
  }

  .segmented {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .source-tab,
  .segment {
    min-width: 0;
    min-height: 56px;
    padding: 0 12px;
    border: 0;
    border-radius: 15px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-weight: 900;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out);
  }

  .source-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 14px;
    white-space: nowrap;
  }

  .segment {
    padding: 0 6px;
    font-size: 12px;
  }

  .segmented--compact .segment {
    padding: 0 3px;
    font-size: 11px;
  }

  .segmented--focus {
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
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

  .source-hint {
    margin: 10px 0 14px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .stack,
  .parameter-stack,
  .candidate-stack,
  .custom-questions-grid {
    display: grid;
    gap: 10px;
  }

  .field {
    display: grid;
    gap: 8px;
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
    color: var(--text-muted);
    transform: translateY(-50%);
  }

  .input-shell .text-control {
    padding-left: 42px;
  }

  .text-control {
    width: 100%;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
    color: var(--text-primary);
    outline: 0;
    transition: background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out);
  }

  .text-control {
    min-height: 52px;
    padding: 14px 15px;
  }

  .text-control::placeholder {
    color: var(--text-muted);
  }

  .text-control:focus {
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--focus-ring) 18%, transparent);
    background: var(--surface-raised);
  }

  textarea.text-control {
    min-height: 132px;
    resize: vertical;
  }

  .role-combobox,
  .role-anchor {
    display: block;
    min-width: 0;
  }

  .role-menu {
    z-index: 50;
    width: min(var(--reka-combobox-trigger-width, 520px), calc(100vw - 28px));
    max-height: min(
      var(--reka-combobox-content-available-height, 300px),
      300px
    );
    overflow: hidden;
    padding: 6px;
  }

  .role-menu-viewport {
    display: grid;
    gap: 3px;
    max-height: 288px;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 2px;
    scrollbar-width: thin;
    scrollbar-color: var(--glass-border-strong) transparent;
  }

  .role-option {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 10px;
    align-items: center;
    min-height: 46px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    padding: 8px 12px;
    text-align: left;
    user-select: none;
    outline: 0;
  }

  .role-option:hover,
  .role-option[data-highlighted] {
    background: var(--surface-raised);
  }

  .role-option--custom {
    border: 1px dashed var(--glass-border);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    grid-template-columns: minmax(0, 1fr) auto;
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

  .role-option--custom strong,
  .role-option--custom small {
    white-space: normal;
  }

  .role-option small,
  .role-option em,
  .parameter-group p {
    color: var(--text-muted);
    font-size: 12px;
    font-style: normal;
  }

  .role-option em {
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    padding: 5px 8px;
    white-space: nowrap;
  }

  .role-option-check {
    width: 16px;
    height: 16px;
    color: var(--accent-2);
  }

  .role-empty {
    padding: 16px 12px;
    color: var(--text-muted);
    font-size: 13px;
  }

  .parameter-group {
    display: grid;
    grid-template-columns: minmax(160px, 0.28fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
  }

  .parameter-group > div {
    min-width: 0;
  }

  .parameter-group--wide {
    align-items: stretch;
  }

  .parameter-stack--settings {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .custom-questions-grid {
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
    align-items: start;
  }

  .question-options {
    display: grid;
    gap: 10px;
  }

  .toggle-option,
  .skip-option,
  .question-mode-note {
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    padding: 14px;
  }

  .toggle-option,
  .skip-option {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: clamp(12px, 1.6vw, 16px);
    align-items: center;
    cursor: pointer;
  }

  .toggle-option input,
  .skip-option input {
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
    transition: background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out);
  }

  .toggle-switch::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: var(--text-muted);
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out);
  }

  .toggle-option input:checked + .toggle-switch,
  .skip-option input:checked + .toggle-switch {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--glass-border));
    background: color-mix(in srgb, var(--accent) 22%, var(--surface-raised));
  }

  .toggle-option input:checked + .toggle-switch::after,
  .skip-option input:checked + .toggle-switch::after {
    background: var(--accent-2);
    transform: translateX(20px);
  }

  .toggle-option input:focus-visible + .toggle-switch,
  .skip-option input:focus-visible + .toggle-switch {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--focus-ring) 18%, transparent);
  }

  .skip-option--active {
    border-color: color-mix(in srgb, var(--accent) 44%, var(--glass-border));
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-soft));
  }

  .toggle-copy,
  .question-mode-note {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .toggle-copy strong,
  .question-mode-note strong {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 900;
  }

  .toggle-copy small,
  .question-mode-note span,
  .file-note,
  .field-hint {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.4;
  }

  .field-hint--warning {
    color: var(--danger);
    font-weight: 800;
  }

  .file-note {
    margin: 0;
  }

  .goal-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .goal-card {
    position: relative;
    display: grid;
    gap: 5px;
    min-height: 104px;
    padding: 14px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out);
  }

  .goal-card::after {
    content: '';
    position: absolute;
    top: 14px;
    right: 14px;
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--glass-border-strong);
    transition: background var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out),
      transform var(--motion-normal) var(--ease-out);
  }

  .goal-card strong {
    color: var(--text-primary);
    font-size: 14px;
  }

  .goal-card span,
  .goal-card small {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.35;
  }

  .goal-card small {
    font-family: var(--font-mono);
    font-weight: 900;
  }

  .goal-card:hover,
  .goal-card--active {
    border-color: color-mix(in srgb, var(--accent) 52%, var(--glass-border));
    background: var(--surface-raised);
    box-shadow: inset 0 1px 0 var(--inner-highlight),
      0 18px 38px color-mix(in srgb, var(--accent) 20%, transparent),
      0 0 0 4px color-mix(in srgb, var(--accent) 10%, transparent);
    transform: translateY(-1px);
  }

  .goal-card--active::after {
    background: var(--accent-2);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent),
      0 0 22px color-mix(in srgb, var(--accent) 30%, transparent);
    transform: scale(1.08);
  }

  .segmented--cards {
    align-items: stretch;
  }

  .segmented--cards .segment {
    min-height: 56px;
    white-space: normal;
  }

  .segmented--cards .segment strong {
    display: grid;
    gap: 1px;
    justify-items: center;
    font-size: 13px;
    line-height: 1.12;
  }

  .segmented--cards .segment small {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 800;
  }

  .resume-preview {
    overflow: hidden;
    min-height: 210px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--surface-raised) 86%, transparent),
      color-mix(in srgb, var(--accent) 8%, var(--surface-soft))
    );
    box-shadow: inset 0 1px 0 var(--inner-highlight);
  }

  .resume-preview__head {
    display: flex;
    justify-content: space-between;
    gap: clamp(12px, 1.6vw, 16px);
    align-items: flex-start;
    padding: 14px 16px;
    border-bottom: 1px solid var(--glass-border);
  }

  .resume-preview__title {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .resume-preview__head span {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .resume-preview__head strong {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 900;
  }

  .resume-preview__head small {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 800;
    line-height: 1.4;
    text-align: right;
  }

  .resume-preview__actions {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
  }

  .resume-preview__clear {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: var(--surface-soft);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 900;
    padding: 0 10px;
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out);
  }

  .resume-preview__clear:hover {
    border-color: var(--focus-ring);
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .resume-preview__clear:active {
    transform: translateY(1px) scale(0.98);
  }

  .resume-preview__clear svg {
    width: 14px;
    height: 14px;
  }

  .resume-preview__body {
    display: grid;
    gap: 10px;
    max-height: 294px;
    overflow-y: auto;
    padding: 16px;
    scrollbar-width: thin;
    scrollbar-color: var(--glass-border-strong) transparent;
  }

  .resume-preview__skeleton {
    padding: 16px;
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
    display: grid;
    gap: 8px;
    align-content: center;
    min-height: 178px;
    padding: 20px 16px;
  }

  .resume-preview__empty strong {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 900;
  }

  .resume-preview__empty p {
    max-width: 48ch;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .file-upload {
    position: relative;
    min-height: 132px;
  }

  .file-upload--compact {
    min-height: 112px;
  }

  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    clip-path: inset(50%);
  }

  .file-drop {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 132px;
    border: 1px dashed var(--glass-border-strong);
    border-radius: var(--radius-control);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--accent) 10%, var(--surface-soft)),
      var(--surface-soft)
    );
    color: var(--text-secondary);
    cursor: pointer;
    padding: 16px;
    transition: border-color var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out),
      transform var(--motion-normal) var(--ease-out);
  }

  .file-drop--compact {
    min-height: 112px;
  }

  .file-input:focus-visible + .file-drop,
  .file-drop:hover {
    border-color: var(--focus-ring);
    background: var(--surface-raised);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--focus-ring) 14%, transparent);
    transform: translateY(-1px);
  }

  .file-drop__icon {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    width: 46px;
    height: 46px;
    border: 1px solid var(--glass-border);
    border-radius: 14px;
    background: var(--button-bg);
    color: var(--button-text);
    box-shadow: var(--button-shadow);
  }

  .file-drop__content {
    flex: 1 1 auto;
    justify-content: flex-start;
    gap: 14px;
    min-width: 0;
  }

  .file-drop__icon svg {
    width: 21px;
    height: 21px;
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
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.35;
  }

  .custom-questions-skeleton {
    margin-top: 4px;
  }

  .error-box {
    display: flex;
    justify-content: space-between;
    gap: clamp(12px, 1.6vw, 16px);
    align-items: center;
    padding: 16px 18px;
    border-color: color-mix(in srgb, var(--danger) 42%, var(--glass-border));
  }

  .error-box p {
    color: var(--danger);
    font-weight: 900;
  }

  .error-box a {
    color: var(--accent-2);
    font-weight: 900;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: clamp(12px, 1.6vw, 16px);
    justify-content: flex-end;
    align-items: center;
  }

  .actions-hint {
    max-width: 44ch;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 800;
    line-height: 1.45;
    text-align: right;
  }

  .start-button {
    min-width: min(100%, 360px);
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
    box-shadow: 0 0 18px
      color-mix(in srgb, var(--accent-2) 72%, transparent);
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

  .interview-start-content h2,
  .interview-start-content p {
    margin: 0;
  }

  .interview-start-content h2 {
    color: var(--text-primary);
    font-size: clamp(26px, 3vw, 42px);
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
    opacity: 0.58;
    transition: color var(--motion-normal) var(--ease-out),
      opacity var(--motion-normal) var(--ease-out);
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
    background: linear-gradient(90deg, transparent, var(--accent-2), transparent);
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

    .context-column--candidate {
      border-left: 0;
      border-top: 1px solid var(--glass-border);
      padding-left: 0;
      padding-top: 18px;
    }
  }

  @media (max-width: 640px) {
    .interview-page {
      gap: 14px;
    }

    .panel,
    .context-panel,
    .settings-panel,
    .custom-questions-panel {
      padding: 16px;
    }

    .segmented,
    .goal-grid {
      grid-template-columns: 1fr;
    }

    .source-tabs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .source-tab {
      gap: 6px;
      padding: 0 8px;
      font-size: 13px;
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

    .parameter-group {
      grid-template-columns: 1fr;
    }

    .resume-preview__actions {
      width: 100%;
      justify-content: space-between;
    }

    .actions,
    .start-button {
      width: 100%;
    }

    .actions-hint {
      max-width: none;
      text-align: left;
    }

    .interview-start-card {
      grid-template-columns: 1fr;
      min-height: 0;
    }

    .interview-start-visual {
      min-height: 150px;
    }

    .interview-start-ring {
      width: 128px;
      height: 128px;
    }

    .interview-start-ring--slow {
      width: 96px;
      height: 96px;
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
  }
</style>

<style>
  /* Дропдаун профессий телепортируется в <body> (ComboboxPortal), поэтому
   ограничение высоты и скролл задаём ГЛОБАЛЬНО — scoped-стили до портала
   не доходят. !important перебивает inline-позиционирование reka-ui. */
  .role-menu {
    width: min(
      var(--reka-combobox-trigger-width, 520px),
      calc(100vw - 28px)
    ) !important;
    max-height: min(
      var(--reka-combobox-content-available-height, 300px),
      calc(100dvh - 140px),
      300px
    ) !important;
    overflow: hidden !important;
  }

  .role-menu-viewport {
    max-height: min(
      calc(var(--reka-combobox-content-available-height, 300px) - 16px),
      calc(100dvh - 156px),
      284px
    ) !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
  }
</style>
