<script setup lang="ts">
  import {
    computed,
    defineAsyncComponent,
    onBeforeUnmount,
    ref,
    watch,
  } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { ApexOptions } from 'apexcharts';
  import type {
    InterviewReportResponse,
    LearningTermContext,
    ReportCriteria,
  } from '@/shared/dto';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import ReportGenerationPanel from '@/app/components/interview/ReportGenerationPanel.vue';
  import TextWithInterviewTerms from '@/app/components/design/TextWithInterviewTerms.vue';
  import { useReportCelebrationConfetti } from '@/app/composables/useReportCelebrationConfetti';
  import { shouldCelebrateReportScore } from '@/app/utils/reportCelebration';

  const { t } = useI18n();
  const route = useRoute();
  const api = useAPI();
  const CRITERIA_KEYS = [
    'structure',
    'specificity',
    'relevance',
    'confidence',
    'riskPhrases',
    'brevity',
  ] as const;

  type CriteriaKey = (typeof CRITERIA_KEYS)[number];
  interface CriteriaScoreRow {
    key: CriteriaKey;
    label: string;
    value: number | null;
  }

  interface CriteriaScoredRow extends CriteriaScoreRow {
    value: number;
  }

  const ApexChart = defineAsyncComponent(() =>
    import('vue3-apexcharts').then((module) => module.default)
  );

  const reportId = computed(() => String(route.params.id || ''));

  const { data, pending, refresh } = await useLazyAsyncData(
    () => `report-${reportId.value}`,
    () =>
      api<InterviewReportResponse>(`/api/interview/reports/${reportId.value}`)
  );

  const report = computed(() => data.value?.report ?? null);
  const isReportInitialLoading = computed(() => pending.value && !data.value);
  const isReportBuilding = computed(
    () =>
      report.value?.status === 'queued' || report.value?.status === 'processing'
  );
  const celebrationLaunched = ref(false);
  const isRetryingReport = ref(false);
  const retryErrorMessage = ref('');
  const openQuestionIds = ref<Set<string>>(new Set());
  const { launchReportCelebration } = useReportCelebrationConfetti();

  let reportRefreshTimer: number | null = null;

  function clearReportRefresh() {
    if (!reportRefreshTimer) return;
    window.clearTimeout(reportRefreshTimer);
    reportRefreshTimer = null;
  }

  function scheduleReportRefresh() {
    if (typeof window === 'undefined') return;
    clearReportRefresh();
    reportRefreshTimer = window.setTimeout(async () => {
      reportRefreshTimer = null;
      if (!isReportBuilding.value) return;
      await refresh();
      if (isReportBuilding.value) scheduleReportRefresh();
    }, 2500);
  }

  async function retryReportGeneration() {
    if (isRetryingReport.value) return;
    isRetryingReport.value = true;
    retryErrorMessage.value = '';
    const sessionId = report.value?.sessionId;
    try {
      if (!sessionId) {
        await refresh();
        return;
      }

      await api<InterviewReportResponse>(
        `/api/interview/sessions/${sessionId}/report`,
        {
          method: 'POST',
        }
      );
      await refresh();
    } catch {
      retryErrorMessage.value = t('report.status.failed');
    } finally {
      isRetryingReport.value = false;
    }
  }

  function criteriaLabel(key: CriteriaKey): string {
    return t(`report.criteria.${key}`);
  }

  function getCriteriaScoreRows(
    criteria?: ReportCriteria | null
  ): CriteriaScoreRow[] {
    return CRITERIA_KEYS.map((key) => ({
      key,
      label: criteriaLabel(key),
      value: criteria ? criteria[key] : null,
    }));
  }

  function isScoredRow(row: CriteriaScoreRow): row is CriteriaScoredRow {
    return typeof row.value === 'number';
  }

  function averageScore(rows: CriteriaScoreRow[]): number | null {
    const values = rows.filter(isScoredRow).map((row) => row.value);
    if (!values.length) return null;
    const sum = values.reduce((total, value) => total + value, 0);
    return Math.round(sum / values.length);
  }

  const criteriaRows = computed(() =>
    getCriteriaScoreRows(report.value?.criteria ?? null).filter(isScoredRow)
  );

  const reportQuestionRows = computed(() =>
    (report.value?.questionAnalysis ?? []).map((item, index) => {
      const criteria = getCriteriaScoreRows(item.criteria ?? null);
      return {
        item,
        number: index + 1,
        displayNumber: String(index + 1).padStart(2, '0'),
        kindLabel: t(
          item.kind === 'clarification'
            ? 'report.questionMatrix.clarification'
            : 'report.questionMatrix.main'
        ),
        criteria,
        averageScore: averageScore(criteria),
      };
    })
  );

  const chartOptions = computed<ApexOptions>(() => ({
    chart: {
      type: 'radar' as const,
      toolbar: { show: false },
    },
    labels: criteriaRows.value.map((row) => row.label),
    colors: ['var(--accent)'],
    plotOptions: {
      radar: {
        polygons: {
          strokeColors: 'var(--glass-border)',
          connectorColors: 'var(--glass-border)',
          fill: {
            colors: [
              'transparent',
              'color-mix(in srgb, var(--surface-soft) 55%, transparent)',
            ],
          },
        },
      },
    },
    markers: {
      size: 3,
      colors: ['var(--accent-2)'],
      strokeColors: 'var(--accent)',
      strokeWidth: 2,
    },
    xaxis: {
      labels: {
        style: {
          colors: criteriaRows.value.map(() => 'var(--text-secondary)'),
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 800,
        },
      },
    },
    yaxis: {
      min: 0,
      max: 100,
      tickAmount: 5,
    },
    dataLabels: {
      enabled: true,
      background: {
        enabled: true,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'var(--glass-border)',
        foreColor: 'var(--text-primary)',
      },
      style: {
        fontSize: '11px',
        fontWeight: 900,
        colors: ['var(--text-primary)'],
      },
    },
    responsive: [
      {
        breakpoint: 520,
        options: {
          chart: { height: 236 },
          dataLabels: { enabled: false },
          xaxis: { labels: { show: false } },
          yaxis: { show: false },
        },
      },
    ],
  }));

  const chartSeries = computed(() => [
    {
      name: t('report.score'),
      data: criteriaRows.value.map((row) => row.value),
    },
  ]);

  const pdfUrl = computed(() =>
    report.value?.id ? `/api/interview/reports/${report.value.id}/pdf` : '#'
  );

  function formatScore(value: number | null): string {
    return typeof value === 'number'
      ? String(value)
      : t('report.questionMatrix.noScore');
  }

  function formatCompactScore(value: number | null): string {
    return typeof value === 'number' ? String(value) : '-';
  }

  function scoreColorToken(value: number | null): string {
    if (typeof value !== 'number') return 'var(--text-muted)';
    if (value < 50) return 'var(--danger)';
    if (value < 75) return 'var(--warning)';
    return 'var(--success)';
  }

  function scorePillStyle(value: number | null): Record<string, string> {
    const score = typeof value === 'number' ? value : 0;
    const intensity = Math.max(14, Math.min(64, Math.round(score * 0.58)));
    return {
      '--score-color': scoreColorToken(value),
      '--score-fill': `color-mix(in srgb, var(--score-color) ${intensity}%, transparent)`,
      '--score-value': String(score),
    };
  }

  function scoreAria(label: string, value: number | null): string {
    return typeof value === 'number'
      ? t('report.questionMatrix.scoreAria', { criteria: label, score: value })
      : `${label}: ${t('report.questionMatrix.noScore')}`;
  }

  function isQuestionOpen(turnId: string): boolean {
    return openQuestionIds.value.has(turnId);
  }

  function toggleQuestion(turnId: string) {
    const next = new Set(openQuestionIds.value);
    if (next.has(turnId)) {
      next.delete(turnId);
    } else {
      next.add(turnId);
    }
    openQuestionIds.value = next;
  }

  function reportTermContext(label: string): LearningTermContext {
    return {
      kind: 'report',
      reportId: reportId.value,
      label,
    };
  }

  watch(
    () => report.value?.status,
    (status) => {
      clearReportRefresh();
      if (status === 'queued' || status === 'processing') {
        scheduleReportRefresh();
      }
    },
    { immediate: true }
  );

  watch(
    () => report.value?.overallScore,
    (score) => {
      if (
        celebrationLaunched.value ||
        report.value?.status !== 'done' ||
        !shouldCelebrateReportScore(score)
      ) {
        return;
      }
      celebrationLaunched.value = true;
      void launchReportCelebration();
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    clearReportRefresh();
  });
</script>

<template>
  <div class="report-page app-page">
    <header class="app-page-header glass-frame glass-frame--soft">
      <NuxtLink to="/history" class="inline-back">{{
        t('report.back')
      }}</NuxtLink>
      <div class="app-page-header__main">
        <p class="page-kicker">{{ t('report.eyebrow') }}</p>
        <h1 class="page-title">{{ t('report.title') }}</h1>
      </div>
    </header>

    <GlassSkeletonStack
      v-if="isReportInitialLoading"
      class="report-skeleton"
      :heights="[240, 320, 180, 220]"
    />

    <ReportGenerationPanel v-else-if="isReportBuilding" />

    <section v-else-if="!report" class="panel glass-frame">
      <p>{{ t('report.empty') }}</p>
    </section>

    <template v-else>
      <ReportGenerationPanel
        v-if="report.status === 'failed'"
        :error-message="
          retryErrorMessage || report.errorMessage || t('report.status.failed')
        "
        :retry-loading="isRetryingReport"
        @retry="retryReportGeneration"
      />

      <template v-else>
        <section class="hero panel glass-frame">
          <div>
            <p class="page-kicker">{{ t('report.score') }}</p>
            <strong>{{ report.overallScore }}</strong>
          </div>
          <div>
            <h2>
              <TextWithInterviewTerms
                :text="report.verdict || ''"
                :context="reportTermContext('Вердикт')"
                manual-selection
              />
            </h2>
            <p>
              <TextWithInterviewTerms
                :text="report.summary || ''"
                :context="reportTermContext('Краткое резюме')"
                manual-selection
              />
            </p>
          </div>
          <a
            class="primary-action primary-action--compact"
            :href="pdfUrl"
            target="_blank"
            rel="noopener"
          >
            {{ t('report.downloadPdf') }}
          </a>
        </section>

        <section class="grid">
          <div class="panel chart-panel glass-frame">
            <h2>{{ t('report.criteria.title') }}</h2>
            <div class="criteria-chart-shell">
              <ClientOnly>
                <ApexChart
                  v-if="criteriaRows.length"
                  type="radar"
                  height="100%"
                  :options="chartOptions"
                  :series="chartSeries"
                />
              </ClientOnly>
            </div>
            <div
              v-if="criteriaRows.length"
              class="criteria-breakdown"
              role="list"
              :aria-label="t('report.criteria.title')"
            >
              <div
                v-for="criterion in criteriaRows"
                :key="criterion.key"
                class="criteria-breakdown__item"
                :style="scorePillStyle(criterion.value)"
                role="listitem"
              >
                <span>{{ criterion.label }}</span>
                <strong>{{ formatScore(criterion.value) }}</strong>
                <i class="criteria-breakdown__bar" aria-hidden="true">
                  <span />
                </i>
              </div>
            </div>
          </div>

          <div class="panel glass-frame">
            <h2>{{ t('report.topFixes') }}</h2>
            <ul class="fixes">
              <li v-for="fix in report.recommendations?.topFixes" :key="fix">
                <TextWithInterviewTerms
                  :text="fix"
                  :context="reportTermContext('Главное улучшение')"
                  manual-selection
                />
              </li>
            </ul>
          </div>
        </section>

        <section class="panel glass-frame question-matrix">
          <div class="question-matrix__header">
            <div>
              <p class="page-kicker">{{ t('report.byQuestions') }}</p>
              <h2>{{ t('report.questionMatrix.title') }}</h2>
              <span class="question-count">
                {{
                  t('report.questionMatrix.count', {
                    count: reportQuestionRows.length,
                  })
                }}
              </span>
            </div>
            <div class="score-legend" aria-hidden="true">
              <span>{{ t('report.questionMatrix.low') }}</span>
              <i />
              <span>{{ t('report.questionMatrix.high') }}</span>
            </div>
          </div>
          <div class="question-list">
            <article
              v-for="row in reportQuestionRows"
              :key="row.item.turnId"
              class="question-card glass-card question-row"
            >
              <button
                class="question-row__summary"
                type="button"
                :aria-expanded="isQuestionOpen(row.item.turnId)"
                :aria-controls="`report-question-${row.item.turnId}`"
                :aria-label="
                  `${
                    isQuestionOpen(row.item.turnId)
                      ? t('report.questionMatrix.collapse')
                      : t('report.questionMatrix.expand')
                  }: ${row.item.question}`
                "
                @click="toggleQuestion(row.item.turnId)"
              >
                <span class="question-summary-main">
                  <span class="question-row__meta">
                    <span class="question-index">{{ row.displayNumber }}</span>
                    <span class="question-kind">{{ row.kindLabel }}</span>
                  </span>
                  <span class="question-summary-text">
                    {{ row.item.question }}
                  </span>
                </span>

                <span class="question-summary-score">
                  <span
                    class="score-average"
                    :style="scorePillStyle(row.averageScore)"
                  >
                    <span>{{ t('report.questionMatrix.average') }}</span>
                    <strong>{{ formatScore(row.averageScore) }}</strong>
                  </span>
                  <span
                    class="question-score-strip"
                    role="list"
                    :aria-label="
                      t('report.questionMatrix.scoreListAria', {
                        number: row.number,
                      })
                    "
                  >
                    <span
                      v-for="score in row.criteria"
                      :key="score.key"
                      class="score-mini"
                      :class="{ 'score-mini--empty': score.value === null }"
                      :style="scorePillStyle(score.value)"
                      role="listitem"
                      :aria-label="scoreAria(score.label, score.value)"
                    >
                      <span class="sr-only">{{ score.label }}</span>
                      <strong class="score-mini__value">
                        {{ formatCompactScore(score.value) }}
                      </strong>
                    </span>
                  </span>
                  <span
                    class="question-toggle-icon"
                    :class="{
                      'question-toggle-icon--open': isQuestionOpen(
                        row.item.turnId
                      ),
                    }"
                    aria-hidden="true"
                  />
                </span>
              </button>

              <div
                v-if="isQuestionOpen(row.item.turnId)"
                :id="`report-question-${row.item.turnId}`"
                class="question-row__details"
              >
                <div class="question-row__body">
                  <div class="question-answer-block">
                    <h3>
                      <TextWithInterviewTerms
                        :text="row.item.question"
                        :context="reportTermContext('Вопрос')"
                        manual-selection
                      />
                    </h3>
                    <div class="answer-panel">
                      <span>{{ t('report.answer') }}</span>
                      <p>
                        <TextWithInterviewTerms
                          :text="row.item.answer"
                          :context="reportTermContext('Ответ')"
                          manual-selection
                        />
                      </p>
                    </div>
                  </div>

                  <div
                    class="question-score-grid question-score-grid--detail"
                    role="list"
                    :aria-label="
                      t('report.questionMatrix.scoreListAria', {
                        number: row.number,
                      })
                    "
                  >
                    <div
                      v-for="score in row.criteria"
                      :key="score.key"
                      class="score-pill"
                      :class="{ 'score-pill--empty': score.value === null }"
                      :style="scorePillStyle(score.value)"
                      role="listitem"
                      :aria-label="scoreAria(score.label, score.value)"
                    >
                      <span>{{ score.label }}</span>
                      <strong>{{ formatScore(score.value) }}</strong>
                    </div>
                  </div>
                </div>

                <div class="question-insight-grid">
                  <p class="insight-block">
                    <strong>{{ t('report.whatWorked') }}</strong>
                    <TextWithInterviewTerms
                      :text="row.item.whatWorked"
                      :context="reportTermContext('Что получилось')"
                      manual-selection
                    />
                  </p>
                  <p class="insight-block">
                    <strong>{{ t('report.whatWeak') }}</strong>
                    <TextWithInterviewTerms
                      :text="row.item.whatWeak"
                      :context="reportTermContext('Что ослабило ответ')"
                      manual-selection
                    />
                  </p>
                </div>

                <div v-if="row.item.modelAnswer" class="model-answer">
                  <span class="model-answer__label">{{
                    t('report.modelAnswer')
                  }}</span>
                  <p>
                    <TextWithInterviewTerms
                      :text="row.item.modelAnswer"
                      :context="reportTermContext('Сильный ответ')"
                      manual-selection
                    />
                  </p>
                </div>
                <p class="practice-line">
                  <strong>
                    <TextWithInterviewTerms
                      :text="t('report.strongerStar')"
                      :context="reportTermContext('STAR')"
                      manual-selection
                    />:
                  </strong>
                  <TextWithInterviewTerms
                    :text="row.item.strongerAnswerStar"
                    :context="reportTermContext('STAR-рекомендация')"
                    manual-selection
                  />
                </p>
                <p class="practice-line">
                  <strong>{{ t('report.nextPractice') }}:</strong>
                  <TextWithInterviewTerms
                    :text="row.item.nextPractice"
                    :context="reportTermContext('Следующая тренировка')"
                    manual-selection
                  />
                </p>
              </div>
            </article>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
  .report-page {
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 1.6vw, 16px);
  }

  .panel {
    padding: clamp(18px, 2.2vw, 26px);
  }

  .panel h2 {
    margin: 0 0 12px;
    color: var(--text-primary);
  }

  .hero {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: flex-start;
    gap: 20px;
  }

  .hero strong {
    display: block;
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 36px;
    line-height: 1;
  }

  .hero h2,
  .hero p {
    margin: 0;
  }

  .hero p {
    color: var(--text-muted);
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
    gap: 18px;
  }

  .chart-panel {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .criteria-chart-shell {
    width: 100%;
    height: clamp(270px, 32vw, 320px);
    min-width: 0;
  }

  .criteria-chart-shell :deep(.vue-apexcharts),
  .criteria-chart-shell :deep(.apexcharts-canvas),
  .criteria-chart-shell :deep(svg) {
    width: 100% !important;
    max-width: 100%;
  }

  .criteria-breakdown {
    display: grid;
    gap: 8px;
  }

  .criteria-breakdown__item {
    --score-color: var(--text-muted);
    --score-value: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px 10px;
    align-items: center;
    border: 1px solid
      color-mix(in srgb, var(--score-color) 34%, var(--glass-border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--score-fill) 48%, transparent);
    padding: 8px 10px;
  }

  .criteria-breakdown__item span {
    min-width: 0;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    line-height: 1.2;
  }

  .criteria-breakdown__item strong {
    color: var(--score-color);
    font-family: var(--font-mono);
    font-size: 15px;
    line-height: 1;
  }

  .criteria-breakdown__bar {
    display: block;
    grid-column: 1 / -1;
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--glass-border) 70%, transparent);
  }

  .criteria-breakdown__bar span {
    display: block;
    width: calc(var(--score-value) * 1%);
    height: 100%;
    border-radius: inherit;
    background: var(--score-color);
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
    padding: 14px;
    color: var(--text-secondary);
  }

  .question-matrix {
    overflow: hidden;
  }

  .question-matrix__header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 16px;
  }

  .question-matrix__header h2,
  .question-matrix__header p {
    margin: 0;
  }

  .question-count {
    display: inline-block;
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 800;
  }

  .score-legend {
    display: grid;
    grid-template-columns: auto minmax(96px, 140px) auto;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 700;
  }

  .score-legend i {
    display: block;
    height: 8px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--danger),
      var(--warning),
      var(--success)
    );
  }

  .question-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .question-card {
    padding: 0;
  }

  .question-row {
    display: grid;
    gap: 0;
    border-color: var(--glass-border-strong);
  }

  .question-row__summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 0.88fr);
    gap: 16px;
    align-items: center;
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    padding: clamp(12px, 1.7vw, 16px);
    text-align: left;
  }

  .question-row__summary:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--focus-ring);
  }

  .question-summary-main {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .question-row__meta {
    display: flex;
    align-items: center;
    justify-content: start;
    gap: 10px;
  }

  .question-index {
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 900;
  }

  .question-kind {
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: var(--surface-soft);
    padding: 6px 10px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
  }

  .question-summary-text {
    display: -webkit-box;
    overflow: hidden;
    color: var(--text-primary);
    font-size: clamp(15px, 1.45vw, 17px);
    font-weight: 800;
    line-height: 1.28;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .question-summary-score {
    display: grid;
    grid-template-columns: minmax(92px, 0.28fr) minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .score-average {
    --score-color: var(--text-muted);
    display: grid;
    gap: 2px;
    min-width: 0;
    border: 1px solid
      color-mix(in srgb, var(--score-color) 44%, var(--glass-border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--score-fill) 68%, var(--surface-soft));
    padding: 7px 9px;
  }

  .score-average span {
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
  }

  .score-average strong {
    color: var(--score-color);
    font-family: var(--font-mono);
    font-size: 17px;
    line-height: 1;
  }

  .question-score-strip {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 4px;
    min-width: 0;
  }

  .score-mini {
    --score-color: var(--text-muted);
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 32px;
    border: 1px solid
      color-mix(in srgb, var(--score-color) 38%, var(--glass-border));
    border-radius: 8px;
    background: color-mix(in srgb, var(--score-fill) 58%, var(--surface-soft));
    padding: 4px;
  }

  .score-mini__value {
    color: var(--score-color);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 900;
    line-height: 1;
  }

  .score-mini--empty {
    opacity: 0.68;
  }

  .question-toggle-icon {
    width: 8px;
    height: 8px;
    border-right: 2px solid var(--text-muted);
    border-bottom: 2px solid var(--text-muted);
    transform: rotate(45deg);
    transition: transform 0.18s ease;
  }

  .question-toggle-icon--open {
    transform: rotate(225deg);
  }

  .question-row__details {
    display: grid;
    gap: 14px;
    border-top: 1px solid var(--glass-border);
    padding: 14px clamp(12px, 1.7vw, 16px) clamp(14px, 1.8vw, 18px);
  }

  .question-row__body {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
    gap: 16px;
    align-items: start;
  }

  .question-answer-block {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .question-answer-block h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: clamp(14px, 1.25vw, 16px);
    line-height: 1.35;
  }

  .answer-panel {
    border-left: 2px solid var(--accent-2);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent-2) 8%, transparent);
    padding: 12px 14px;
  }

  .answer-panel span {
    display: block;
    margin-bottom: 6px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .answer-panel p {
    margin: 0;
    color: var(--text-primary);
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .question-score-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .score-pill {
    --score-color: var(--text-muted);
    --score-fill: transparent;
    --score-value: 0;
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-height: 36px;
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--score-color) 44%, var(--glass-border));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--score-fill) 72%, var(--surface-soft));
    padding: 8px 9px;
  }

  .score-pill::before {
    content: '';
    position: absolute;
    inset: auto 0 0;
    width: calc(var(--score-value) * 1%);
    height: 3px;
    background: var(--score-color);
  }

  .score-pill span,
  .score-pill strong {
    position: relative;
  }

  .score-pill span {
    min-width: 0;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.15;
  }

  .score-pill strong {
    color: var(--score-color);
    font-family: var(--font-mono);
    font-size: 16px;
    line-height: 1;
  }

  .score-pill--empty {
    opacity: 0.72;
  }

  .score-pill--empty strong {
    font-family: var(--font-ui);
    font-size: 12px;
  }

  .question-insight-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .insight-block,
  .practice-line {
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  .insight-block {
    border-top: 1px solid var(--glass-border);
    padding-top: 12px;
  }

  .insight-block strong,
  .practice-line strong {
    display: block;
    margin-bottom: 4px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .model-answer {
    margin: 0;
    border-left: 3px solid var(--accent);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 9%, transparent);
    padding: 10px 14px;
  }

  .model-answer__label {
    display: block;
    margin-bottom: 4px;
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .model-answer p {
    margin: 0;
    color: var(--text-primary);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .error {
    color: var(--danger);
    font-weight: 700;
  }

  @media (max-width: 820px) {
    .hero,
    .grid,
    .question-row__summary,
    .question-summary-score,
    .question-row__body,
    .question-insight-grid {
      grid-template-columns: 1fr;
    }
    .question-matrix__header {
      align-items: start;
      flex-direction: column;
    }
    .primary-action {
      width: 100%;
      justify-content: center;
    }
  }

  @media (max-width: 520px) {
    .criteria-chart-shell {
      height: 236px;
      margin-inline: -6px;
    }
    .question-score-grid {
      grid-template-columns: 1fr;
    }
    .question-score-strip {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .score-legend {
      width: 100%;
      grid-template-columns: auto minmax(80px, 1fr) auto;
    }
  }
</style>
