<script setup lang="ts">
  import {
    ArrowRightIcon,
    CheckIcon,
    CubeIcon,
    FileTextIcon,
    Link2Icon,
    QuestionMarkCircledIcon,
  } from '@radix-icons/vue';
  import { computed, reactive, ref, type Component } from 'vue';
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
    ResumeExtractResponse,
  } from '@/shared/dto';
  import VoiceTextarea from '@/app/components/form/VoiceTextarea.vue';

  type SourceType = CreateInterviewSessionRequest['source']['type'];
  type InterviewLevel = CreateInterviewSessionRequest['level'];
  type InterviewerMode = CreateInterviewSessionRequest['interviewerMode'];
  type InterviewSessionGoal = CreateInterviewSessionRequest['sessionGoal'];
  type QuestionSourceMode = NonNullable<
    CreateInterviewSessionRequest['questionSourceMode']
  >;

  interface RoleOption {
    role: string;
    specialization: string;
    group: string;
  }

  const { t } = useI18n();
  const route = useRoute();
  const api = useAPI();

  const initialSource = ['hh_url', 'text', 'profession'].includes(
    String(route.query.source || '')
  )
    ? (String(route.query.source) as SourceType)
    : 'hh_url';

  const sourceType = ref<SourceType>(initialSource);
  const isSubmitting = ref(false);
  const isExtractingResume = ref(false);
  const errorMessage = ref('');
  const errorCode = ref('');
  const rolePickerOpen = ref(false);
  const rolePickerRequested = ref(false);
  const roleSearchTerm = ref('');
  const selectedRoleOption = ref<RoleOption | null>(null);
  const resumeFileName = ref('');

  const form = reactive({
    hhUrl: '',
    vacancyText: '',
    vacancyTitle: '',
    professionRole: String(route.query.role || ''),
    specialization: '',
    resumeText: '',
    level: (route.query.level === 'junior' ||
    route.query.level === 'middle' ||
    route.query.level === 'senior'
      ? route.query.level
      : 'middle') as InterviewLevel,
    sessionGoal: 'standard' as InterviewSessionGoal,
    questionSourceMode: 'mixed' as QuestionSourceMode,
    customQuestionsText: '',
    interviewerMode: (route.query.mode === 'soft' ||
    route.query.mode === 'neutral' ||
    route.query.mode === 'strict'
      ? route.query.mode
      : 'neutral') as InterviewerMode,
  });

  if (form.professionRole) {
    sourceType.value = 'profession';
  }

  const sourceTabs: Array<{
    value: SourceType;
    label: string;
    icon: Component;
  }> = [
    { value: 'hh_url', label: 'interview.new.source.hh', icon: Link2Icon },
    { value: 'text', label: 'interview.new.source.text', icon: FileTextIcon },
    {
      value: 'profession',
      label: 'interview.new.source.profession',
      icon: CubeIcon,
    },
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

  const questionSourceOptions: Array<{
    value: QuestionSourceMode;
    label: string;
  }> = [
    { value: 'jobai', label: 'interview.questionSource.jobai' },
    { value: 'mixed', label: 'interview.questionSource.mixed' },
    { value: 'custom', label: 'interview.questionSource.custom' },
  ];

  const avatarByMode: Record<InterviewerMode, InterviewerAvatarId> = {
    soft: 'warm-hr',
    neutral: 'neutral-pro',
    strict: 'strict-lead',
  };

  const visibleRoleOptions = computed(() => {
    const query = roleSearchTerm.value.trim().toLowerCase();
    if (!query) return popularRoles;
    return popularRoles.filter((item) =>
      `${item.role} ${item.specialization} ${item.group}`
        .toLowerCase()
        .includes(query)
    );
  });

  const roleInputValue = computed({
    get: () =>
      rolePickerOpen.value ? roleSearchTerm.value : form.professionRole,
    set: (value: string) => {
      roleSearchTerm.value = value;
      form.professionRole = value;
      selectedRoleOption.value = null;
      rolePickerOpen.value = true;
    },
  });

  const selectedSourceHint = computed(() => {
    if (sourceType.value === 'hh_url') return t('interview.new.sourceHint.hh');
    if (sourceType.value === 'text') return t('interview.new.sourceHint.text');
    return t('interview.new.sourceHint.profession');
  });

  const canSubmit = computed(() => {
    if (isSubmitting.value) return false;
    if (
      form.questionSourceMode === 'custom' &&
      form.customQuestionsText.trim().length < 8
    ) {
      return false;
    }
    if (sourceType.value === 'hh_url') return form.hhUrl.trim().length > 0;
    if (sourceType.value === 'text')
      return form.vacancyText.trim().length >= 10;
    return form.professionRole.trim().length >= 2;
  });

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

  function selectRole(option: RoleOption) {
    form.professionRole = option.role;
    form.specialization = option.specialization;
    selectedRoleOption.value = option;
    rolePickerOpen.value = false;
    roleSearchTerm.value = '';
  }

  function selectRoleValue(value: unknown) {
    if (value && typeof value === 'object' && 'role' in value) {
      selectRole(value as RoleOption);
    }
  }

  function buildPayload(): CreateInterviewSessionRequestInput {
    const base = {
      resumeText: form.resumeText.trim() || undefined,
      role: form.professionRole.trim() || undefined,
      level: form.level,
      sessionGoal: form.sessionGoal,
      questionSourceMode: form.questionSourceMode,
      customQuestionsText: form.customQuestionsText.trim() || undefined,
      language: 'ru' as const,
      interviewerMode: form.interviewerMode,
      interviewerAvatarId: avatarByMode[form.interviewerMode],
    };

    if (sourceType.value === 'hh_url') {
      return {
        ...base,
        source: { type: 'hh_url', url: form.hhUrl.trim() },
      };
    }

    if (sourceType.value === 'text') {
      return {
        ...base,
        source: {
          type: 'text',
          text: form.vacancyText.trim(),
          title: form.vacancyTitle.trim() || undefined,
        },
      };
    }

    return {
      ...base,
      source: {
        type: 'profession',
        role: form.professionRole.trim(),
        specialization: form.specialization.trim() || undefined,
      },
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
      form.resumeText = response.text;
    } catch (err) {
      errorMessage.value = extractApiError(err);
    } finally {
      isExtractingResume.value = false;
      input.value = '';
    }
  }

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
    <header class="setup-hero glass-frame">
      <div>
        <p class="page-kicker">{{ t('interview.new.eyebrow') }}</p>
        <h1 class="page-title">{{ t('interview.new.title') }}</h1>
        <p class="page-subtitle">{{ t('interview.new.subtitle') }}</p>
      </div>
      <div class="hero-meter" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </header>

    <section class="setup-grid">
      <article class="panel glass-frame">
        <div class="panel-head">
          <div>
            <p class="panel-label">{{ t('interview.new.source.kicker') }}</p>
            <h2>{{ t('interview.new.source.title') }}</h2>
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
            :class="{ 'source-tab--active': sourceType === tab.value }"
            @click="sourceType = tab.value"
          >
            <component :is="tab.icon" aria-hidden="true" />
            {{ t(tab.label) }}
          </button>
        </div>

        <p class="source-hint">{{ selectedSourceHint }}</p>

        <div v-if="sourceType === 'hh_url'" class="field">
          <label for="hh-url">{{ t('interview.new.fields.hhUrl') }}</label>
          <div class="input-shell">
            <Link2Icon aria-hidden="true" />
            <input
              id="hh-url"
              v-model="form.hhUrl"
              class="text-control"
              type="url"
              placeholder="https://hh.ru/vacancy/123456"
            />
          </div>
        </div>

        <div v-else-if="sourceType === 'text'" class="stack">
          <div class="field">
            <label for="vacancy-title">{{
              t('interview.new.fields.vacancyTitle')
            }}</label>
            <input
              id="vacancy-title"
              v-model="form.vacancyTitle"
              class="text-control"
              type="text"
              :placeholder="t('interview.new.placeholders.vacancyTitle')"
            />
          </div>
          <div class="field">
            <label for="vacancy-text">{{
              t('interview.new.fields.vacancyText')
            }}</label>
            <VoiceTextarea
              id="vacancy-text"
              v-model="form.vacancyText"
              :rows="8"
              :placeholder="t('interview.new.placeholders.vacancyText')"
            />
          </div>
        </div>

        <div v-else class="stack">
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
                  :placeholder="t('interview.new.placeholders.professionRole')"
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
                  :side-flip="false"
                  :collision-padding="12"
                >
                  <ComboboxViewport class="role-menu-viewport">
                    <ComboboxItem
                      v-for="option in visibleRoleOptions"
                      :key="`${option.group}-${option.role}`"
                      :value="option"
                      class="role-option"
                    >
                      <span>
                        <strong>{{ option.role }}</strong>
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
        </div>
      </article>

      <article class="panel glass-frame">
        <div class="panel-head">
          <div>
            <p class="panel-label">{{ t('interview.new.params.kicker') }}</p>
            <h2>{{ t('interview.new.params.title') }}</h2>
          </div>
        </div>

        <div class="parameter-stack">
          <section class="parameter-group">
            <div>
              <h3>{{ t('interview.new.fields.level') }}</h3>
              <p>{{ t('interview.new.fields.levelHint') }}</p>
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
              <p>{{ t('interview.new.fields.interviewerModeHint') }}</p>
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
              <h3>{{ t('interview.new.fields.sessionGoal') }}</h3>
              <p>{{ t('interview.new.fields.sessionGoalHint') }}</p>
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
      </article>
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

        <div class="parameter-group">
          <div>
            <h3>{{ t('interview.new.fields.questionSourceMode') }}</h3>
            <p>{{ t('interview.new.fields.questionSourceModeHint') }}</p>
          </div>
          <div class="segmented" role="radiogroup">
            <button
              v-for="option in questionSourceOptions"
              :key="option.value"
              type="button"
              class="segment"
              :class="{
                'segment--active': form.questionSourceMode === option.value,
              }"
              @click="form.questionSourceMode = option.value"
            >
              {{ t(option.label) }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="resume-panel glass-frame glass-frame--soft">
      <div class="panel-head">
        <div>
          <p class="panel-label">{{ t('interview.new.resume.kicker') }}</p>
          <h2>{{ t('interview.new.resume.title') }}</h2>
        </div>
        <span class="optional-label">{{ t('common.optional') }}</span>
      </div>

      <div class="resume-grid">
        <div class="field">
          <label for="resume-file">{{ t('interview.new.resume.file') }}</label>
          <div class="file-upload">
            <input
              id="resume-file"
              class="file-input"
              type="file"
              accept=".pdf,.txt,.md,text/plain,application/pdf"
              :disabled="isExtractingResume"
              @change="onResumeFileChange"
            />
            <label class="file-drop" for="resume-file">
              <span class="file-drop__icon" aria-hidden="true">
                <FileTextIcon />
              </span>
              <span class="file-drop__copy">
                <strong>
                  {{
                    isExtractingResume
                      ? t('interview.new.resume.extracting')
                      : t('interview.new.resume.uploadTitle')
                  }}
                </strong>
                <small>
                  {{
                    resumeFileName || t('interview.new.resume.uploadHint')
                  }}
                </small>
              </span>
            </label>
          </div>
        </div>
        <div class="field">
          <label for="resume-text">{{ t('interview.new.resume.text') }}</label>
          <VoiceTextarea
            id="resume-text"
            v-model="form.resumeText"
            :rows="5"
            :placeholder="t('interview.new.placeholders.resumeText')"
          />
        </div>
      </div>
    </section>

    <div v-if="errorMessage" class="error-box glass-frame">
      <p>{{ errorMessage }}</p>
      <NuxtLink v-if="errorCode === 'E_FORBIDDEN'" to="/pricing">
        {{ t('interview.new.limit.pricing') }}
      </NuxtLink>
    </div>

    <div class="actions">
      <button
        class="primary-action start-button"
        type="submit"
        :disabled="!canSubmit"
      >
        {{
          isSubmitting
            ? t('interview.new.actions.starting')
            : t('interview.new.actions.start')
        }}
        <span class="primary-action__icon" aria-hidden="true">
          <CheckIcon v-if="isSubmitting" />
          <ArrowRightIcon v-else />
        </span>
      </button>
    </div>
  </form>
</template>

<style scoped>
  .setup-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 24px;
    align-items: end;
    padding: clamp(22px, 4vw, 42px);
  }

  .setup-hero .page-subtitle {
    margin-top: 18px;
  }

  .hero-meter {
    display: grid;
    grid-template-columns: repeat(3, 18px);
    gap: 8px;
    align-items: end;
    height: 96px;
  }

  .hero-meter span {
    border-radius: 999px;
    background: var(--button-bg);
    box-shadow: var(--button-shadow);
    animation: meter-rise 3s var(--ease-spring) infinite;
  }

  .hero-meter span:nth-child(1) {
    height: 46px;
  }

  .hero-meter span:nth-child(2) {
    height: 78px;
    animation-delay: 160ms;
  }

  .hero-meter span:nth-child(3) {
    height: 58px;
    animation-delay: 320ms;
  }

  .setup-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
    gap: 18px;
  }

  .panel,
  .resume-panel,
  .custom-questions-panel {
    padding: clamp(20px, 3vw, 30px);
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 18px;
  }

  .panel-label {
    margin: 0 0 8px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.13em;
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

  .source-help,
  .optional-label {
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

  .optional-label {
    padding: 0 12px;
    font-size: 12px;
    font-weight: 900;
  }

  .source-tabs,
  .segmented {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 6px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--surface-soft);
  }

  .source-tab,
  .segment {
    min-width: 0;
    min-height: 48px;
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
    margin: 14px 0 18px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .stack,
  .parameter-stack,
  .resume-grid,
  .custom-questions-grid {
    display: grid;
    gap: 16px;
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
    gap: 10px;
  }

  .custom-questions-grid {
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
    align-items: start;
  }

  .goal-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .goal-card {
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
    border-color: var(--glass-border-strong);
    background: var(--surface-raised);
    box-shadow: inset 0 1px 0 var(--inner-highlight),
      0 12px 26px color-mix(in srgb, var(--accent) 14%, transparent);
    transform: translateY(-1px);
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

  .resume-grid {
    grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.2fr);
  }

  .file-upload {
    position: relative;
    min-height: 132px;
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
    transition:
      border-color var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out),
      transform var(--motion-normal) var(--ease-out);
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

  .error-box {
    display: flex;
    justify-content: space-between;
    gap: 12px;
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
    justify-content: flex-end;
  }

  .start-button {
    min-width: min(100%, 360px);
  }

  @keyframes meter-rise {
    0%,
    100% {
      transform: scaleY(0.74);
      opacity: 0.7;
    }

    50% {
      transform: scaleY(1);
      opacity: 1;
    }
  }

  @media (max-width: 1365px) {
    .setup-hero,
    .setup-grid,
    .resume-grid,
    .custom-questions-grid {
      grid-template-columns: 1fr;
    }

    .hero-meter {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .panel,
    .resume-panel,
    .custom-questions-panel,
    .setup-hero {
      padding: 18px;
    }

    .source-tabs,
    .segmented,
    .goal-grid {
      grid-template-columns: 1fr;
    }

    .source-tabs {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .source-tab {
      gap: 6px;
      padding: 0 8px;
      font-size: 13px;
    }

    .panel-head,
    .error-box {
      flex-direction: column;
      align-items: flex-start;
    }

    .actions,
    .start-button {
      width: 100%;
    }
  }
</style>

<style>
  /* Дропдаун профессий телепортируется в <body> (ComboboxPortal), поэтому
   ограничение высоты и скролл задаём ГЛОБАЛЬНО — scoped-стили до портала
   не доходят. !important перебивает inline-позиционирование reka-ui. */
  .role-menu {
    max-height: 300px !important;
    overflow: hidden !important;
  }

  .role-menu-viewport {
    max-height: 284px !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
  }
</style>
