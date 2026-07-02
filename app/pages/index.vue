<script setup lang="ts">
  import {
    ArrowRightIcon,
    BarChartIcon,
    CheckCircledIcon,
    LightningBoltIcon,
    RocketIcon,
  } from '@radix-icons/vue';
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { DashboardSummaryResponse } from '@/shared/dto';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import TextWithInterviewTerms from '@/app/components/design/TextWithInterviewTerms.vue';

  const { t } = useI18n();
  const api = useAPI();

  const { data: summary, pending } = await useLazyAsyncData(
    'dashboard-summary',
    () => api<DashboardSummaryResponse>('/api/dashboard/summary')
  );

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
        key: 'limit',
        label: t('dashboard.stats.freeLimit'),
        value: `${totals?.freeSessionsUsed ?? 0}/${
          totals?.freeSessionsLimit ?? 1
        }`,
        icon: LightningBoltIcon,
      },
    ];
  });

  const tips = computed(() => [
    {
      key: 'company',
      title: t('dashboard.tips.company.title'),
      text: t('dashboard.tips.company.text'),
    },
    {
      key: 'structure',
      title: t('dashboard.tips.structure.title'),
      text: t('dashboard.tips.structure.text'),
    },
    {
      key: 'proof',
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

  function scenarioLink(
    scenario: DashboardSummaryResponse['quickScenarios'][number]
  ) {
    return {
      path: '/interview/new',
      query: {
        source: 'profession',
        ...(scenario.role ? { role: scenario.role } : {}),
        level: scenario.level,
        mode: scenario.interviewerMode,
        focus: scenario.focus,
      },
    };
  }
</script>

<template>
  <div class="dashboard-page app-page">
    <section class="hero-grid">
      <article class="hero-copy glass-frame">
        <div class="hero-copy__main">
          <p class="page-kicker">{{ t('dashboard.eyebrow') }}</p>
          <h1 class="page-title">{{ t('dashboard.title') }}</h1>
          <p class="page-subtitle">{{ t('dashboard.subtitle') }}</p>

          <div v-if="summary?.activeSession" class="active-inline">
            <span>{{ t('dashboard.active') }}</span>
            <strong>{{ summary.activeSession.title }}</strong>
            <small>{{ activeSessionProgress }}</small>
          </div>
        </div>

        <div class="hero-actions">
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
          <NuxtLink to="/questions" class="secondary-link">
            {{ t('dashboard.questionBankCta') }}
          </NuxtLink>
        </div>
      </article>
    </section>

    <GlassSkeletonStack
      v-if="pending"
      class="dashboard-skeleton"
      :heights="[112, 228, 180]"
    />

    <template v-else>
      <section class="stats-grid" :aria-label="t('dashboard.statsLabel')">
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

      <section class="workbench-grid">
        <article class="panel panel--wide glass-frame">
          <div class="panel-head">
            <div>
              <p class="panel-label">
                {{ t('dashboard.quickScenariosLabel') }}
              </p>
              <h2>{{ t('dashboard.quickScenarios') }}</h2>
            </div>
            <NuxtLink to="/interview/new">{{
              t('dashboard.customScenario')
            }}</NuxtLink>
          </div>

          <div class="scenarios">
            <NuxtLink
              v-for="scenario in summary?.quickScenarios || []"
              :key="scenario.id"
              class="scenario"
              :to="scenarioLink(scenario)"
            >
              <span>
                <strong>{{ scenario.title }}</strong>
                <small>
                  <TextWithInterviewTerms :text="scenario.subtitle" />
                </small>
              </span>
              <ArrowRightIcon aria-hidden="true" />
            </NuxtLink>
          </div>
        </article>

        <article class="panel glass-frame">
          <div class="panel-head">
            <div>
              <p class="panel-label">{{ t('dashboard.focusLabel') }}</p>
              <h2>{{ t('dashboard.fixBeforeInterview') }}</h2>
            </div>
          </div>

          <ol v-if="summary?.topFixes.length" class="fixes">
            <li v-for="fix in summary.topFixes" :key="fix">
              <TextWithInterviewTerms :text="fix" />
            </li>
          </ol>
          <div v-else class="tips">
            <article v-for="tip in tips" :key="tip.key" class="tip">
              <strong>{{ tip.title }}</strong>
              <span>
                <TextWithInterviewTerms :text="tip.text" />
              </span>
            </article>
          </div>
        </article>
      </section>

      <section class="panel glass-frame">
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
        <p v-else class="muted">{{ t('history.empty') }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
  .dashboard-page {
    gap: clamp(12px, 1.6vw, 16px);
  }

  .hero-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: clamp(14px, 1.6vw, 18px);
  }

  .hero-copy,
  .panel,
  .stat {
    padding: clamp(18px, 2.2vw, 28px);
  }

  .hero-copy {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    justify-content: space-between;
    gap: 18px;
    align-items: center;
    padding: clamp(16px, 1.8vw, 22px);
  }

  .hero-copy__main {
    display: grid;
    gap: 9px;
    min-width: 0;
  }

  .hero-copy .page-title {
    max-width: 720px;
    font-size: clamp(34px, 4vw, 56px);
    line-height: 0.96;
  }

  .hero-copy .page-subtitle {
    max-width: 48ch;
    font-size: 15px;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: clamp(12px, 1.6vw, 16px);
    align-items: center;
  }

  .secondary-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 52px;
    padding: 0 18px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
    color: var(--text-secondary);
    font-weight: 800;
    text-decoration: none;
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out);
  }

  .secondary-link:hover {
    transform: translateY(-2px);
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .active-inline {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    width: fit-content;
    max-width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
  }

  .active-inline span {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .active-inline strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .active-inline small {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }

  .panel-label {
    margin: 0 0 9px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  h2,
  p {
    margin: 0;
  }

  .panel h2 {
    color: var(--text-primary);
    font-size: clamp(22px, 2.2vw, 30px);
    line-height: 1.08;
    text-wrap: balance;
  }

  .muted,
  .scenario small,
  .session-row small,
  .tip span {
    color: var(--text-muted);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: clamp(12px, 1.6vw, 16px);
  }

  .stat {
    display: grid;
    gap: clamp(12px, 1.6vw, 16px);
  }

  .stat-icon {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border-radius: 14px;
    background: var(--surface-soft);
    color: var(--accent-2);
  }

  .stat-icon svg {
    width: 18px;
    height: 18px;
  }

  .stat span:not(.stat-icon) {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 800;
  }

  .stat strong {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: clamp(24px, 3vw, 36px);
    line-height: 1;
  }

  .workbench-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
    gap: clamp(12px, 1.6vw, 16px);
  }

  .panel {
    min-width: 0;
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 18px;
  }

  .panel-head a {
    color: var(--accent-2);
    font-size: 13px;
    font-weight: 900;
    text-decoration: none;
  }

  .scenarios,
  .recent,
  .tips {
    display: grid;
    gap: 10px;
  }

  .scenario,
  .session-row,
  .tip {
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    background: var(--surface-soft);
  }

  .scenario,
  .session-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
    padding: 16px;
    color: var(--text-primary);
    text-decoration: none;
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out);
  }

  .scenario:hover,
  .session-row:hover {
    transform: translateY(-2px);
    border-color: var(--glass-border-strong);
    background: var(--surface-raised);
  }

  .scenario span,
  .session-row span {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .scenario strong,
  .session-row strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scenario svg {
    color: var(--accent-2);
  }

  .session-row b {
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 14px;
  }

  .fixes {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fixes li,
  .tip {
    padding: 14px;
    color: var(--text-secondary);
  }

  .fixes li {
    border-left: 2px solid var(--accent);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
  }

  .tip {
    display: grid;
    gap: 5px;
  }

  .tip strong {
    color: var(--text-primary);
  }

  @media (max-width: 1365px) {
    .workbench-grid {
      grid-template-columns: 1fr;
    }

    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    .dashboard-page {
      gap: 14px;
    }

    .hero-copy {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .hero-copy,
    .panel,
    .stat {
      padding: 16px;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .active-inline {
      grid-template-columns: 1fr;
      width: 100%;
    }

    .active-inline small,
    .active-inline strong {
      white-space: normal;
    }

    .hero-actions,
    .primary-action,
    .secondary-link {
      width: 100%;
    }

    .panel-head,
    .session-row {
      grid-template-columns: 1fr;
    }
  }
</style>
