<script setup lang="ts">
  import {
    ArrowRightIcon,
    BarChartIcon,
    CheckCircledIcon,
    FileTextIcon,
    LightningBoltIcon,
    RocketIcon,
  } from '@radix-icons/vue';
  import { computed, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type {
    CreateInterviewSessionRequestInput,
    DashboardSummaryResponse,
    InterviewStateResponse,
    LearningTermContext,
  } from '@/shared/dto';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import TextWithInterviewTerms from '@/app/components/design/TextWithInterviewTerms.vue';

  const { t } = useI18n();
  const api = useAPI();

  const { data: summary, pending } = await useLazyAsyncData(
    'dashboard-summary',
    () => api<DashboardSummaryResponse>('/api/dashboard/summary')
  );

  const isSubmitting = ref(false);
  const quickStartError = ref('');
  const dashboardQuickForm = reactive({
    sourceText: '',
    resumeText: '',
  });

  const hasSessions = computed(() => (summary.value?.totals.sessions ?? 0) > 0);

  const quickLauncherDefaults = [
    'Стандарт · 15 мин',
    t('dashboard.mixedDefault'),
    t('dashboard.levelDefault'),
  ];

  const stats = computed(() => {
    const totals = summary.value?.totals;
    return [
      {
        key: 'sessions',
        label: t('dashboard.stats.sessions'),
        value: totals?.sessions ?? 0,
        icon: RocketIcon,
      },
      {
        key: 'completed',
        label: t('dashboard.stats.completed'),
        value: totals?.completed ?? 0,
        icon: CheckCircledIcon,
      },
      {
        key: 'average',
        label: t('dashboard.stats.averageScore'),
        value:
          typeof totals?.averageScore === 'number'
            ? t('common.score', { score: totals.averageScore })
            : t('common.noScore'),
        icon: BarChartIcon,
      },
      {
        key: 'trial',
        label: t('dashboard.trialUsage'),
        value: `${totals?.freeSessionsUsed ?? 0}/${
          totals?.freeSessionsLimit ?? 1
        }`,
        icon: LightningBoltIcon,
      },
    ];
  });

  const howItWorks = computed(() => [
    {
      key: 'source',
      title: t('dashboard.tips.company.title'),
      text: t('dashboard.tips.company.text'),
    },
    {
      key: 'answer',
      title: t('dashboard.tips.structure.title'),
      text: t('dashboard.tips.structure.text'),
    },
    {
      key: 'report',
      title: t('dashboard.tips.proof.title'),
      text: t('dashboard.tips.proof.text'),
    },
  ]);

  const activeLink = computed(() =>
    summary.value?.activeSession
      ? `/interview/${summary.value.activeSession.id}`
      : '/interview/new'
  );

  const activeSessionProgress = computed(() => {
    const activeSession = summary.value?.activeSession;
    if (!activeSession) return '';
    return t('history.progress', {
      answered: activeSession.answeredQuestions,
      total: activeSession.totalQuestions,
    });
  });

  const topFixes = computed(() => summary.value?.topFixes ?? []);

  function dashboardTermContext(label: string): LearningTermContext {
    return {
      kind: 'dashboard',
      label,
    };
  }

  function scenarioLink(
    scenario: DashboardSummaryResponse['quickScenarios'][number]
  ) {
    return {
      path: '/interview/new',
      query: {
        source: 'manual',
        ...(scenario.role ? { role: scenario.role } : {}),
        level: scenario.level,
        mode: scenario.interviewerMode,
        focus: scenario.focus,
      },
    };
  }

  function normalizeUrlLike(value: string): string | null {
    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[\w.-]+\.[a-zа-яё]{2,}(\/\S*)?$/iu.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return null;
  }

  function buildDashboardSource():
    | CreateInterviewSessionRequestInput['source']
    | null {
    const value = dashboardQuickForm.sourceText.trim();
    if (value.length < 2) return null;

    const url = normalizeUrlLike(value);
    if (url) {
      return {
        type: 'hh_url',
        url,
      };
    }

    if (value.length >= 40 || value.includes('\n')) {
      return {
        type: 'text',
        text: value,
      };
    }

    return {
      type: 'profession',
      role: value,
    };
  }

  const quickStartReady = computed(() => Boolean(buildDashboardSource()));

  async function startQuickInterview() {
    const source = buildDashboardSource();
    if (!source) {
      quickStartError.value = t('dashboard.launcherNeedSource');
      return;
    }

    if (source.type === 'text' && source.text.length < 10) {
      quickStartError.value = t('dashboard.launcherNeedDescription');
      return;
    }

    isSubmitting.value = true;
    quickStartError.value = '';
    try {
      const body: CreateInterviewSessionRequestInput = {
        source,
        resumeText: dashboardQuickForm.resumeText.trim() || undefined,
        level: 'middle',
        sessionGoal: 'standard',
        questionSourceMode: 'mixed',
        language: 'ru',
        interviewerMode: 'neutral',
        interviewerAvatarId: 'neutral-pro',
      };
      const state = await api<InterviewStateResponse>(
        '/api/interview/sessions',
        {
          method: 'POST',
          body,
        }
      );
      await navigateTo(`/interview/${state.session.id}`);
    } catch (error) {
      quickStartError.value =
        error instanceof Error
          ? error.message
          : t('interview.common.unknownError');
    } finally {
      isSubmitting.value = false;
    }
  }
</script>

<template>
  <div class="dashboard-page app-page">
    <GlassSkeletonStack
      v-if="pending"
      class="dashboard-skeleton"
      :heights="[220, 160, 260]"
    />

    <template v-else>
      <section v-if="!hasSessions" class="first-run-dashboard dashboard-mode">
        <article class="quick-launcher quick-launcher--hero glass-frame">
          <div class="launcher-copy">
            <p class="page-kicker">{{ t('dashboard.eyebrow') }}</p>
            <h1 class="page-title">{{ t('dashboard.launcherTitle') }}</h1>
            <p class="page-subtitle">{{ t('dashboard.launcherHelper') }}</p>
          </div>

          <form class="launcher-form" @submit.prevent="startQuickInterview">
            <div class="field">
              <label for="dashboard-source">{{
                t('dashboard.launcherInputLabel')
              }}</label>
              <input
                id="dashboard-source"
                v-model="dashboardQuickForm.sourceText"
                class="text-control"
                type="text"
                :placeholder="t('dashboard.launcherInputPlaceholder')"
              />
            </div>

            <div class="field">
              <label for="dashboard-resume">{{
                t('dashboard.launcherResumeLabel')
              }}</label>
              <textarea
                id="dashboard-resume"
                v-model="dashboardQuickForm.resumeText"
                class="text-control"
                rows="3"
                :placeholder="t('dashboard.launcherResumePlaceholder')"
              />
            </div>

            <div class="launcher-footer">
              <div class="summary-chips">
                <span v-for="item in quickLauncherDefaults" :key="item">
                  {{ item }}
                </span>
              </div>
              <button
                class="primary-action button-loader-host"
                type="submit"
                :disabled="isSubmitting || !quickStartReady"
              >
                <ButtonLoader v-if="isSubmitting" />
                <span
                  class="button-loader-content"
                  :class="{ 'button-loader-content--loading': isSubmitting }"
                >
                  {{ t('dashboard.launcherStart') }}
                  <span class="primary-action__icon" aria-hidden="true">
                    <ArrowRightIcon />
                  </span>
                </span>
              </button>
            </div>

            <p v-if="quickStartError" class="form-error">
              {{ quickStartError }}
            </p>
            <NuxtLink class="detail-link" to="/interview/new">
              {{ t('dashboard.configure') }}
            </NuxtLink>
          </form>
        </article>

        <section class="how-it-works glass-frame">
          <div class="panel-head">
            <div>
              <p class="panel-label">{{ t('dashboard.howItWorksLabel') }}</p>
              <h2>{{ t('dashboard.howItWorksTitle') }}</h2>
            </div>
          </div>
          <div class="steps-grid">
            <article v-for="(step, index) in howItWorks" :key="step.key">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <strong>{{ step.title }}</strong>
              <p>
                <TextWithInterviewTerms
                  :text="step.text"
                  :context="dashboardTermContext('Первый запуск')"
                />
              </p>
            </article>
          </div>
        </section>

        <section class="scenario-panel glass-frame">
          <div class="panel-head">
            <div>
              <p class="panel-label">
                {{ t('dashboard.sampleScenariosLabel') }}
              </p>
              <h2>{{ t('dashboard.sampleScenariosTitle') }}</h2>
            </div>
            <NuxtLink to="/interview/new">{{
              t('dashboard.customScenario')
            }}</NuxtLink>
          </div>
          <div class="scenario-grid">
            <NuxtLink
              v-for="scenario in summary?.quickScenarios || []"
              :key="scenario.id"
              class="scenario"
              :to="scenarioLink(scenario)"
            >
              <strong>{{ scenario.title }}</strong>
              <small>
                <TextWithInterviewTerms
                  :text="scenario.subtitle"
                  :context="dashboardTermContext('Сценарий')"
                />
              </small>
              <ArrowRightIcon aria-hidden="true" />
            </NuxtLink>
          </div>
        </section>
      </section>

      <section v-else class="returning-dashboard dashboard-mode">
        <article class="returning-hero glass-frame">
          <div>
            <p class="page-kicker">{{ t('dashboard.eyebrow') }}</p>
            <h1 class="page-title">{{ t('dashboard.returningTitle') }}</h1>
            <p class="page-subtitle">{{ t('dashboard.subtitle') }}</p>

            <div v-if="summary?.activeSession" class="active-inline">
              <span>{{ t('dashboard.active') }}</span>
              <strong>{{ summary.activeSession.title }}</strong>
              <small>{{ activeSessionProgress }}</small>
            </div>
          </div>

          <NuxtLink :to="activeLink" class="primary-action">
            {{
              summary?.activeSession
                ? t('dashboard.continue')
                : t('dashboard.startCta')
            }}
            <span class="primary-action__icon" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </NuxtLink>
        </article>

        <section class="stats-strip" :aria-label="t('dashboard.statsLabel')">
          <article
            v-for="item in stats"
            :key="item.key"
            class="stat glass-frame glass-frame--soft"
          >
            <span class="stat-icon" aria-hidden="true">
              <component :is="item.icon" />
            </span>
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </article>
        </section>

        <section class="returning-grid">
          <article class="quick-launcher glass-frame">
            <div class="panel-head">
              <div>
                <p class="panel-label">
                  {{ t('dashboard.quickScenariosLabel') }}
                </p>
                <h2>{{ t('dashboard.launcherTitleReturning') }}</h2>
              </div>
              <NuxtLink to="/interview/new">{{
                t('dashboard.customScenario')
              }}</NuxtLink>
            </div>

            <form
              class="launcher-form launcher-form--compact"
              @submit.prevent="startQuickInterview"
            >
              <div class="field">
                <label for="dashboard-source-returning">{{
                  t('dashboard.launcherInputLabel')
                }}</label>
                <input
                  id="dashboard-source-returning"
                  v-model="dashboardQuickForm.sourceText"
                  class="text-control"
                  type="text"
                  :placeholder="t('dashboard.launcherInputPlaceholder')"
                />
              </div>
              <div class="summary-chips">
                <span v-for="item in quickLauncherDefaults" :key="item">
                  {{ item }}
                </span>
              </div>
              <div class="launcher-footer">
                <p v-if="quickStartError" class="form-error">
                  {{ quickStartError }}
                </p>
                <button
                  class="primary-action button-loader-host"
                  type="submit"
                  :disabled="isSubmitting || !quickStartReady"
                >
                  <ButtonLoader v-if="isSubmitting" />
                  <span
                    class="button-loader-content"
                    :class="{ 'button-loader-content--loading': isSubmitting }"
                  >
                    {{ t('dashboard.launcherStart') }}
                    <span class="primary-action__icon" aria-hidden="true">
                      <ArrowRightIcon />
                    </span>
                  </span>
                </button>
              </div>
            </form>
          </article>

          <article class="recommendations glass-frame">
            <div class="panel-head">
              <div>
                <p class="panel-label">{{ t('dashboard.focusLabel') }}</p>
                <h2>{{ t('dashboard.fixBeforeInterview') }}</h2>
              </div>
            </div>

            <ol v-if="topFixes.length" class="fixes">
              <li v-for="fix in topFixes" :key="fix">
                <TextWithInterviewTerms
                  :text="fix"
                  :context="dashboardTermContext('Главное улучшение')"
                />
              </li>
            </ol>
            <div v-else class="empty-state">
              <FileTextIcon aria-hidden="true" />
              <strong>{{ t('dashboard.zeroStateTitle') }}</strong>
              <p>{{ t('dashboard.zeroStateText') }}</p>
            </div>
          </article>
        </section>

        <section class="history-panel glass-frame">
          <div class="panel-head">
            <div>
              <p class="panel-label">{{ t('dashboard.timelineLabel') }}</p>
              <h2>{{ t('dashboard.recent') }}</h2>
            </div>
            <NuxtLink to="/history">{{ t('nav.history') }}</NuxtLink>
          </div>

          <div v-if="summary?.recentSessions.length" class="recent">
            <NuxtLink
              v-for="item in summary.recentSessions"
              :key="item.id"
              class="session-row"
              :to="`/interview/${item.id}`"
            >
              <span>
                <strong>{{ item.title }}</strong>
                <small>{{
                  t('history.progress', {
                    answered: item.answeredQuestions,
                    total: item.totalQuestions,
                  })
                }}</small>
              </span>
              <b>
                {{
                  item.report?.overallScore
                    ? t('common.score', { score: item.report.overallScore })
                    : t(`common.status.${item.status}`)
                }}
              </b>
            </NuxtLink>
          </div>
          <p v-else class="muted">{{ t('dashboard.recentEmpty') }}</p>
        </section>
      </section>
    </template>
  </div>
</template>

<style scoped>
  .dashboard-page,
  .dashboard-mode {
    gap: clamp(12px, 1.6vw, 16px);
  }

  .dashboard-mode,
  .launcher-form,
  .steps-grid article,
  .empty-state {
    display: grid;
  }

  .quick-launcher,
  .returning-hero,
  .how-it-works,
  .scenario-panel,
  .recommendations,
  .history-panel,
  .stat {
    padding: clamp(16px, 2.2vw, 26px);
  }

  .quick-launcher--hero {
    display: grid;
    grid-template-columns: minmax(0, 0.78fr) minmax(360px, 0.52fr);
    gap: clamp(18px, 3vw, 42px);
    align-items: start;
    min-height: 340px;
  }

  .launcher-copy {
    display: grid;
    gap: 12px;
    align-content: start;
  }

  .quick-launcher--hero .page-title {
    max-width: 720px;
    font-size: clamp(30px, 4vw, 52px);
    line-height: 0.98;
  }

  .quick-launcher--hero .page-subtitle {
    max-width: 58ch;
  }

  .launcher-form {
    gap: 12px;
    min-width: 0;
  }

  .launcher-form--compact {
    gap: 14px;
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
    min-height: 98px;
    resize: vertical;
  }

  .launcher-footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
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
    white-space: nowrap;
  }

  .form-error {
    color: var(--danger);
    font-size: 13px;
    font-weight: 850;
  }

  .detail-link,
  .panel-head a {
    color: var(--accent-2);
    font-size: 13px;
    font-weight: 900;
    text-decoration: none;
  }

  .how-it-works,
  .scenario-panel {
    display: grid;
    gap: 16px;
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
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
  p {
    margin: 0;
  }

  h2 {
    color: var(--text-primary);
    font-size: clamp(18px, 1.8vw, 24px);
    line-height: 1.08;
  }

  .steps-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .steps-grid article,
  .scenario,
  .session-row,
  .empty-state {
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--surface-soft);
  }

  .steps-grid article {
    gap: 10px;
    padding: 16px;
  }

  .steps-grid span {
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 900;
  }

  .steps-grid strong,
  .scenario strong,
  .empty-state strong {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 900;
  }

  .steps-grid p,
  .scenario small,
  .empty-state p,
  .muted,
  .session-row small {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.45;
  }

  .scenario-grid,
  .recent {
    display: grid;
    gap: 10px;
  }

  .scenario-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .scenario,
  .session-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    color: var(--text-primary);
    padding: 14px;
    text-decoration: none;
    transition: background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      transform var(--motion-normal) var(--ease-out);
  }

  .scenario {
    grid-template-columns: minmax(0, 1fr);
    min-height: 132px;
  }

  .scenario svg {
    justify-self: end;
    color: var(--accent-2);
  }

  .scenario:hover,
  .session-row:hover {
    border-color: var(--glass-border-strong);
    background: var(--surface-raised);
    transform: translateY(-2px);
  }

  .returning-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px;
    align-items: center;
  }

  .returning-hero > div {
    display: grid;
    gap: 9px;
    min-width: 0;
  }

  .returning-hero .page-title {
    max-width: 720px;
    font-size: clamp(26px, 3vw, 38px);
    line-height: 1;
  }

  .returning-hero .page-subtitle {
    max-width: 52ch;
  }

  .active-inline {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    width: fit-content;
    max-width: 100%;
    margin-top: 4px;
    padding: 10px 12px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
  }

  .active-inline span {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .active-inline strong,
  .session-row strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .active-inline small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }

  .stats-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .stat {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
  }

  .stat-icon {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 12px;
    background: var(--surface-soft);
    color: var(--accent-2);
  }

  .stat span:not(.stat-icon) {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  .stat strong {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 18px;
    line-height: 1;
  }

  .returning-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 0.82fr);
    gap: clamp(12px, 1.6vw, 16px);
  }

  .quick-launcher,
  .recommendations,
  .history-panel {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .fixes {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fixes li {
    border-left: 2px solid var(--accent);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    color: var(--text-secondary);
    padding: 14px;
  }

  .empty-state {
    gap: 8px;
    align-content: center;
    min-height: 170px;
    padding: 18px;
  }

  .empty-state svg {
    width: 22px;
    height: 22px;
    color: var(--accent-2);
  }

  .session-row span {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .session-row b {
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 14px;
  }

  @media (max-width: 1365px) {
    .quick-launcher--hero,
    .returning-grid {
      grid-template-columns: 1fr;
    }

    .scenario-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stats-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .quick-launcher,
    .returning-hero,
    .how-it-works,
    .scenario-panel,
    .recommendations,
    .history-panel,
    .stat {
      padding: 16px;
    }

    .launcher-footer,
    .returning-hero,
    .steps-grid,
    .scenario-grid,
    .stats-strip,
    .stat,
    .session-row {
      grid-template-columns: 1fr;
    }

    .primary-action,
    .launcher-footer .primary-action {
      width: 100%;
    }

    .active-inline {
      grid-template-columns: 1fr;
      width: 100%;
    }

    .active-inline small,
    .active-inline strong,
    .session-row strong {
      white-space: normal;
    }

    .stat {
      align-items: start;
    }

    .scenario {
      min-height: 0;
    }
  }
</style>
