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

  const { t } = useI18n();
  const api = useAPI();

  const { data: summary, pending } = await useAsyncData(
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

  function scenarioLink(role: string, level: string, mode: string) {
    return {
      path: '/interview/new',
      query: {
        source: 'profession',
        role,
        level,
        mode,
      },
    };
  }
</script>

<template>
  <div class="dashboard-page app-page">
    <section class="hero-grid">
      <article class="hero-copy glass-frame">
        <p class="page-kicker">{{ t('dashboard.eyebrow') }}</p>
        <h1 class="page-title">{{ t('dashboard.title') }}</h1>
        <p class="page-subtitle">{{ t('dashboard.subtitle') }}</p>

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

      <article class="active-card glass-frame glass-frame--interactive">
        <div>
          <p class="panel-label">{{ t('dashboard.active') }}</p>
          <h2>
            {{ summary?.activeSession?.title || t('dashboard.noActive') }}
          </h2>
          <p>
            {{
              summary?.activeSession
                ? t('history.progress', {
                    answered: summary.activeSession.answeredQuestions,
                    total: summary.activeSession.totalQuestions,
                  })
                : t('dashboard.startHint')
            }}
          </p>
        </div>

        <div class="signal" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </article>
    </section>

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
            <p class="panel-label">{{ t('dashboard.quickScenariosLabel') }}</p>
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
            :to="
              scenarioLink(
                scenario.role,
                scenario.level,
                scenario.interviewerMode
              )
            "
          >
            <span>
              <strong>{{ scenario.title }}</strong>
              <small>{{ scenario.subtitle }}</small>
            </span>
            <ArrowRightIcon aria-hidden="true" />
          </NuxtLink>
          <p v-if="pending" class="muted">{{ t('common.loading') }}</p>
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
          <li v-for="fix in summary.topFixes" :key="fix">{{ fix }}</li>
        </ol>
        <div v-else class="tips">
          <article v-for="tip in tips" :key="tip.key" class="tip">
            <strong>{{ tip.title }}</strong>
            <span>{{ tip.text }}</span>
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
      <p v-else class="muted">
        {{ pending ? t('common.loading') : t('history.empty') }}
      </p>
    </section>
  </div>
</template>

<style scoped>
  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
    gap: 18px;
  }

  .hero-copy,
  .active-card,
  .panel,
  .stat {
    padding: clamp(20px, 3vw, 34px);
  }

  .hero-copy {
    min-height: 330px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 28px;
  }

  .hero-copy .page-subtitle {
    margin-top: 18px;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .secondary-link {
    display: inline-flex;
    align-items: center;
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

  .active-card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 330px;
    gap: 28px;
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

  .active-card h2,
  .panel h2 {
    color: var(--text-primary);
    font-size: clamp(22px, 2.2vw, 30px);
    line-height: 1.08;
    text-wrap: balance;
  }

  .active-card p:last-child,
  .muted,
  .scenario small,
  .session-row small,
  .tip span {
    color: var(--text-muted);
  }

  .signal {
    display: flex;
    align-items: end;
    gap: 8px;
    height: 86px;
  }

  .signal span {
    width: 18px;
    border-radius: 999px;
    background: var(--button-bg);
    box-shadow: var(--button-shadow);
    animation: signal-pulse 2.8s var(--ease-spring) infinite;
  }

  .signal span:nth-child(1) {
    height: 42px;
  }

  .signal span:nth-child(2) {
    height: 72px;
    animation-delay: 180ms;
  }

  .signal span:nth-child(3) {
    height: 54px;
    animation-delay: 360ms;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .stat {
    display: grid;
    gap: 12px;
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
    gap: 18px;
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
    gap: 12px;
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

  @keyframes signal-pulse {
    0%,
    100% {
      transform: scaleY(0.72);
      opacity: 0.68;
    }

    48% {
      transform: scaleY(1);
      opacity: 1;
    }
  }

  @media (max-width: 1365px) {
    .hero-grid,
    .workbench-grid {
      grid-template-columns: 1fr;
    }

    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    .hero-copy,
    .active-card,
    .panel,
    .stat {
      padding: 18px;
    }

    .stats-grid {
      grid-template-columns: 1fr;
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
