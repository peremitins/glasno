<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ApexOptions } from 'apexcharts';
import type { InterviewReportResponse } from '@/shared/dto';

const { t } = useI18n();
const route = useRoute();
const api = useAPI();
const ApexChart = defineAsyncComponent(() =>
  import('vue3-apexcharts').then((module) => module.default)
);

const reportId = computed(() => String(route.params.id || ''));

const { data, pending, refresh } = await useAsyncData(
  () => `report-${reportId.value}`,
  () => api<InterviewReportResponse>(`/api/interview/reports/${reportId.value}`)
);

const report = computed(() => data.value?.report ?? null);

const criteriaRows = computed(() => {
  const criteria = report.value?.criteria;
  if (!criteria) return [];
  return [
    { key: 'structure', label: t('report.criteria.structure'), value: criteria.structure },
    { key: 'specificity', label: t('report.criteria.specificity'), value: criteria.specificity },
    { key: 'relevance', label: t('report.criteria.relevance'), value: criteria.relevance },
    { key: 'confidence', label: t('report.criteria.confidence'), value: criteria.confidence },
    { key: 'riskPhrases', label: t('report.criteria.riskPhrases'), value: criteria.riskPhrases },
    { key: 'brevity', label: t('report.criteria.brevity'), value: criteria.brevity },
  ];
});

const chartOptions = computed<ApexOptions>(() => ({
  chart: {
    type: 'radar' as const,
    toolbar: { show: false },
  },
  labels: criteriaRows.value.map((row) => row.label),
  colors: ['var(--color-accent)'],
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
</script>

<template>
  <div class="page">
    <header class="header">
      <NuxtLink to="/history" class="back">{{ t('report.back') }}</NuxtLink>
      <div>
        <p class="eyebrow">{{ t('report.eyebrow') }}</p>
        <h1>{{ t('report.title') }}</h1>
      </div>
    </header>

    <section v-if="pending" class="panel">
      <p>{{ t('report.loading') }}</p>
    </section>

    <section v-else-if="!report" class="panel">
      <p>{{ t('report.empty') }}</p>
    </section>

    <template v-else>
      <section v-if="report.status !== 'done'" class="panel status-panel">
        <h2>{{ t(`report.status.${report.status}`) }}</h2>
        <p v-if="report.errorMessage" class="error">{{ report.errorMessage }}</p>
        <button type="button" class="ghost" @click="refresh()">
          {{ t('report.refresh') }}
        </button>
      </section>

      <template v-else>
        <section class="hero panel">
          <div>
            <p class="eyebrow">{{ t('report.score') }}</p>
            <strong>{{ report.overallScore }}</strong>
          </div>
          <div>
            <h2>{{ report.verdict }}</h2>
            <p>{{ report.summary }}</p>
          </div>
          <a class="primary-link" :href="pdfUrl" target="_blank" rel="noopener">
            {{ t('report.downloadPdf') }}
          </a>
        </section>

        <section class="grid">
          <div class="panel chart-panel">
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

          <div class="panel">
            <h2>{{ t('report.topFixes') }}</h2>
            <ol class="fixes">
              <li v-for="fix in report.recommendations?.topFixes" :key="fix">
                {{ fix }}
              </li>
            </ol>
          </div>
        </section>

        <section class="panel">
          <h2>{{ t('report.byQuestions') }}</h2>
          <div class="question-list">
            <article
              v-for="item in report.questionAnalysis"
              :key="item.turnId"
              class="question-card"
            >
              <h3>{{ item.question }}</h3>
              <p><strong>{{ t('report.answer') }}:</strong> {{ item.answer }}</p>
              <p><strong>{{ t('report.whatWorked') }}:</strong> {{ item.whatWorked }}</p>
              <p><strong>{{ t('report.whatWeak') }}:</strong> {{ item.whatWeak }}</p>
              <div v-if="item.modelAnswer" class="model-answer">
                <span class="model-answer__label">{{ t('report.modelAnswer') }}</span>
                <p>{{ item.modelAnswer }}</p>
              </div>
              <p><strong>{{ t('report.strongerStar') }}:</strong> {{ item.strongerAnswerStar }}</p>
              <p><strong>{{ t('report.nextPractice') }}:</strong> {{ item.nextPractice }}</p>
            </article>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.header {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.header h1,
.header p {
  margin: 0;
}
.back {
  color: var(--color-accent);
  font-weight: 700;
  text-decoration: none;
}
.eyebrow {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
}
.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 20px;
}
.panel h2 {
  margin: 0 0 12px;
}
.hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
}
.hero strong {
  display: block;
  color: var(--color-accent);
  font-size: 56px;
  line-height: 1;
}
.hero h2,
.hero p {
  margin: 0;
}
.hero p {
  color: var(--color-muted);
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
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding-left: 20px;
}
.question-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.question-card {
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
}
.question-card h3,
.question-card p {
  margin: 0 0 8px;
}
.question-card p {
  color: var(--color-muted);
}
.model-answer {
  margin: 0 0 8px;
  border-left: 3px solid var(--color-accent);
  border-radius: 0;
  background: color-mix(in srgb, var(--color-accent) 7%, transparent);
  padding: 10px 14px;
}
.model-answer__label {
  display: block;
  margin-bottom: 4px;
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.model-answer p {
  margin: 0;
  color: var(--color-text);
  white-space: pre-wrap;
}
.primary-link,
.ghost {
  border-radius: 10px;
  font: inherit;
  font-weight: 700;
}
.primary-link {
  background: var(--color-accent);
  color: #fff;
  padding: 12px 14px;
  text-decoration: none;
  white-space: nowrap;
}
.ghost {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  padding: 9px 12px;
}
.error {
  color: var(--color-danger);
  font-weight: 700;
}

@media (max-width: 820px) {
  .hero,
  .grid {
    grid-template-columns: 1fr;
  }
  .primary-link {
    justify-content: center;
  }
}
</style>
