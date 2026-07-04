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
  import type { InterviewReportResponse, LearningTermContext } from '@/shared/dto';
  import GlassSkeletonStack from '@/app/components/design/GlassSkeletonStack.vue';
  import ReportGenerationPanel from '@/app/components/interview/ReportGenerationPanel.vue';
  import TextWithInterviewTerms from '@/app/components/design/TextWithInterviewTerms.vue';
  import { useReportCelebrationConfetti } from '@/app/composables/useReportCelebrationConfetti';
  import { shouldCelebrateReportScore } from '@/app/utils/reportCelebration';

  const { t } = useI18n();
  const route = useRoute();
  const api = useAPI();
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
      report.value?.status === 'queued' ||
      report.value?.status === 'processing'
  );
  const celebrationLaunched = ref(false);
  const isRetryingReport = ref(false);
  const retryErrorMessage = ref('');
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

  const criteriaRows = computed(() => {
    const criteria = report.value?.criteria;
    if (!criteria) return [];
    return [
      {
        key: 'structure',
        label: t('report.criteria.structure'),
        value: criteria.structure,
      },
      {
        key: 'specificity',
        label: t('report.criteria.specificity'),
        value: criteria.specificity,
      },
      {
        key: 'relevance',
        label: t('report.criteria.relevance'),
        value: criteria.relevance,
      },
      {
        key: 'confidence',
        label: t('report.criteria.confidence'),
        value: criteria.confidence,
      },
      {
        key: 'riskPhrases',
        label: t('report.criteria.riskPhrases'),
        value: criteria.riskPhrases,
      },
      {
        key: 'brevity',
        label: t('report.criteria.brevity'),
        value: criteria.brevity,
      },
    ];
  });

  const chartOptions = computed<ApexOptions>(() => ({
    chart: {
      type: 'radar' as const,
      toolbar: { show: false },
    },
    labels: criteriaRows.value.map((row) => row.label),
    colors: ['var(--accent)'],
    yaxis: {
      min: 0,
      max: 100,
      tickAmount: 5,
    },
    dataLabels: { enabled: true },
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
            <ClientOnly>
              <ApexChart
                v-if="criteriaRows.length"
                type="radar"
                height="320"
                :options="chartOptions"
                :series="chartSeries"
              />
            </ClientOnly>
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

        <section class="panel glass-frame">
          <h2>{{ t('report.byQuestions') }}</h2>
          <div class="question-list">
            <article
              v-for="item in report.questionAnalysis"
              :key="item.turnId"
              class="question-card glass-card"
            >
              <h3>
                <TextWithInterviewTerms
                  :text="item.question"
                  :context="reportTermContext('Вопрос')"
                  manual-selection
                />
              </h3>
              <p>
                <strong>{{ t('report.answer') }}:</strong>
                <TextWithInterviewTerms
                  :text="item.answer"
                  :context="reportTermContext('Ответ')"
                  manual-selection
                />
              </p>
              <p>
                <strong>{{ t('report.whatWorked') }}:</strong>
                <TextWithInterviewTerms
                  :text="item.whatWorked"
                  :context="reportTermContext('Что получилось')"
                  manual-selection
                />
              </p>
              <p>
                <strong>{{ t('report.whatWeak') }}:</strong>
                <TextWithInterviewTerms
                  :text="item.whatWeak"
                  :context="reportTermContext('Что ослабило ответ')"
                  manual-selection
                />
              </p>
              <div v-if="item.modelAnswer" class="model-answer">
                <span class="model-answer__label">{{
                  t('report.modelAnswer')
                }}</span>
                <p>
                  <TextWithInterviewTerms
                    :text="item.modelAnswer"
                    :context="reportTermContext('Сильный ответ')"
                    manual-selection
                  />
                </p>
              </div>
              <p>
                <strong>
                  <TextWithInterviewTerms
                    :text="t('report.strongerStar')"
                    :context="reportTermContext('STAR')"
                    manual-selection
                  />:
                </strong>
                <TextWithInterviewTerms
                  :text="item.strongerAnswerStar"
                  :context="reportTermContext('STAR-рекомендация')"
                  manual-selection
                />
              </p>
              <p>
                <strong>{{ t('report.nextPractice') }}:</strong>
                <TextWithInterviewTerms
                  :text="item.nextPractice"
                  :context="reportTermContext('Следующая тренировка')"
                  manual-selection
                />
              </p>
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
    align-items: center;
    gap: 20px;
  }

  .hero strong {
    display: block;
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 56px;
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
    padding: 14px;
    color: var(--text-secondary);
  }

  .question-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .question-card {
    padding: 14px;
  }

  .question-card h3,
  .question-card p {
    margin: 0 0 8px;
  }

  .question-card h3 {
    color: var(--text-primary);
  }

  .question-card p {
    color: var(--text-muted);
  }

  .model-answer {
    margin: 0 0 8px;
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
    white-space: pre-wrap;
  }

  .error {
    color: var(--danger);
    font-weight: 700;
  }

  @media (max-width: 820px) {
    .hero,
    .grid {
      grid-template-columns: 1fr;
    }
    .primary-action {
      width: 100%;
      justify-content: center;
    }
  }
</style>
