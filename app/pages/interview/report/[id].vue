<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { QuestionMarkCircledIcon } from '@radix-icons/vue';
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
  const CRITERIA_KEYS = ['substance', 'structure', 'delivery'] as const;

  type CriteriaKey = (typeof CRITERIA_KEYS)[number];
  interface CriteriaScoreRow {
    key: CriteriaKey;
    label: string;
    hint: string;
    value: number | null;
  }

  interface CriteriaScoredRow extends CriteriaScoreRow {
    value: number;
  }

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

  function criteriaHint(key: CriteriaKey): string {
    return t(`report.criteria.${key}Hint`);
  }

  function getCriteriaScoreRows(
    criteria?: ReportCriteria | null
  ): CriteriaScoreRow[] {
    return CRITERIA_KEYS.map((key) => ({
      key,
      label: criteriaLabel(key),
      hint: criteriaHint(key),
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

  const pdfUrl = computed(() =>
    report.value?.id ? `/api/interview/reports/${report.value.id}/pdf` : '#'
  );

  function formatScore(value: number | null): string {
    return typeof value === 'number'
      ? String(value)
      : t('report.questionMatrix.noScore');
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
            <div
              v-if="criteriaRows.length"
              class="criteria-bars"
              role="list"
              :aria-label="t('report.criteria.title')"
            >
              <div
                v-for="criterion in criteriaRows"
                :key="criterion.key"
                class="criteria-bar"
                :style="scorePillStyle(criterion.value)"
                role="listitem"
              >
                <div class="criteria-bar__head">
                  <span class="criteria-bar__label">
                    <span class="criteria-bar__name">{{
                      criterion.label
                    }}</span>
                    <button
                      v-tooltip="{
                        content: criterion.hint,
                        theme: 'learning-term-tooltip',
                        triggers: ['hover', 'focus', 'touch'],
                        placement: 'top',
                      }"
                      type="button"
                      class="criteria-bar__hint"
                      :aria-label="
                        t('report.criteria.hintAria', {
                          criterion: criterion.label,
                        })
                      "
                      @click.prevent
                    >
                      <QuestionMarkCircledIcon aria-hidden="true" />
                    </button>
                  </span>
                  <strong class="criteria-bar__score">
                    {{ formatScore(criterion.value) }}
                  </strong>
                </div>
                <div class="criteria-bar__track" aria-hidden="true">
                  <span class="criteria-bar__fill" />
                </div>
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
                :aria-label="`${
                  isQuestionOpen(row.item.turnId)
                    ? t('report.questionMatrix.collapse')
                    : t('report.questionMatrix.expand')
                }: ${row.item.question}`"
                @click="toggleQuestion(row.item.turnId)"
              >
                <span class="question-summary-head">
                  <span class="question-row__meta">
                    <span class="question-index">{{ row.displayNumber }}</span>
                    <span class="question-kind">{{ row.kindLabel }}</span>
                  </span>
                  <span class="question-summary-aside">
                    <span
                      class="score-average"
                      :style="scorePillStyle(row.averageScore)"
                    >
                      <span>{{ t('report.questionMatrix.average') }}</span>
                      <strong>{{ formatScore(row.averageScore) }}</strong>
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
                </span>
                <span
                  v-if="!isQuestionOpen(row.item.turnId)"
                  class="question-summary-text"
                >
                  {{ row.item.question }}
                </span>
              </button>

              <Transition name="q-expand">
                <div
                  v-if="isQuestionOpen(row.item.turnId)"
                  :id="`report-question-${row.item.turnId}`"
                  class="question-row__reveal"
                >
                  <div class="question-row__details">
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
                </div>
              </Transition>
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
    padding: clamp(8px, 2.2vw, 26px);
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
    align-content: start;
    min-width: 0;
  }

  .criteria-bars {
    display: grid;
    gap: clamp(12px, 2.4vw, 18px);
  }

  .criteria-bar {
    --score-color: var(--text-muted);
    --score-value: 0;
    display: grid;
    gap: 10px;
    min-width: 0;
    border: 1px solid
      color-mix(in srgb, var(--score-color) 30%, var(--glass-border));
    border-radius: var(--radius-md, 16px);
    background: color-mix(in srgb, var(--score-fill) 32%, transparent);
    padding: clamp(12px, 2.4vw, 18px);
  }

  .criteria-bar__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .criteria-bar__label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .criteria-bar__name {
    min-width: 0;
    color: var(--text-primary);
    font-size: clamp(14px, 1.6vw, 16px);
    font-weight: 800;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .criteria-bar__hint {
    display: inline-grid;
    place-items: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    cursor: help;
    transition: color 0.15s ease;
  }

  .criteria-bar__hint:hover,
  .criteria-bar__hint:focus-visible {
    color: var(--accent-2);
    outline: none;
  }

  .criteria-bar__hint:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent-2) 62%, transparent);
    outline-offset: 2px;
  }

  .criteria-bar__hint svg {
    width: 16px;
    height: 16px;
  }

  .criteria-bar__score {
    flex-shrink: 0;
    color: var(--score-color);
    font-family: var(--font-mono);
    font-size: clamp(20px, 3vw, 26px);
    font-weight: 900;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .criteria-bar__track {
    height: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--glass-border) 70%, transparent);
  }

  .criteria-bar__fill {
    display: block;
    width: calc(var(--score-value) * 1%);
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--score-color) 72%, transparent),
      var(--score-color)
    );
    transition: width 0.5s ease;
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
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 1.7vw, 16px);
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

  .question-summary-head {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: space-between;
    min-width: 0;
  }

  .question-row__meta {
    display: flex;
    align-items: center;
    justify-content: start;
    gap: 10px;
    min-width: 0;
  }

  .question-summary-aside {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
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
    font-size: clamp(14px, 1.25vw, 16px);
    line-height: 1.28;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .score-average {
    --score-color: var(--text-muted);
    display: flex;
    align-items: baseline;
    gap: 6px;
    border: 1px solid
      color-mix(in srgb, var(--score-color) 44%, var(--glass-border));
    border-radius: 999px;
    background: color-mix(in srgb, var(--score-fill) 68%, var(--surface-soft));
    padding: 4px 10px;
    white-space: nowrap;
  }

  .score-average span {
    color: var(--text-muted);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1;
    text-transform: uppercase;

    @media (max-width: 370px) {
      display: none;
    }
  }

  .score-average strong {
    color: var(--score-color);
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1;
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

  .question-row__reveal {
    display: grid;
    grid-template-rows: 1fr;
  }

  .question-row__reveal > * {
    min-height: 0;
    overflow: hidden;
  }

  .q-expand-enter-active,
  .q-expand-leave-active {
    transition: grid-template-rows 0.28s ease, opacity 0.28s ease;
  }

  .q-expand-enter-from,
  .q-expand-leave-to {
    grid-template-rows: 0fr;
    opacity: 0;
  }

  .question-row__details {
    display: grid;
    gap: 14px;
    /* border-top: 1px solid var(--glass-border); */
    padding: 0px clamp(12px, 1.7vw, 16px) clamp(14px, 1.8vw, 18px);
  }

  .question-row__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
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
    line-height: 1.28;
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
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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

  @media (prefers-reduced-motion: reduce) {
    .q-expand-enter-active,
    .q-expand-leave-active {
      transition: none;
    }
  }

  @media (max-width: 820px) {
    .hero,
    .grid,
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
    .question-score-grid {
      grid-template-columns: 1fr;
    }
    .score-legend {
      width: 100%;
      grid-template-columns: auto minmax(80px, 1fr) auto;
    }
  }
</style>
