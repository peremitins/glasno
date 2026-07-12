<script setup lang="ts">
  import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useNuxtApp } from 'nuxt/app';
  import { gsap } from 'gsap';
  import { useLandingContent } from '@/composables/useLandingContent';

  const { report } = useLandingContent();
  const nuxtApp = useNuxtApp();

  const root = ref<HTMLElement | null>(null);
  const previewDialog = ref<HTMLDialogElement | null>(null);
  let ctx: gsap.Context | null = null;
  let isPageScrollLocked = false;
  let scrollY = 0;
  let documentOverflow = '';
  let bodyPosition = '';
  let bodyTop = '';
  let bodyLeft = '';
  let bodyRight = '';
  let bodyWidth = '';
  let bodyOverflow = '';

  function lockPageScroll() {
    if (typeof window === 'undefined' || isPageScrollLocked) return;

    const { documentElement, body } = document;
    scrollY = window.scrollY;
    documentOverflow = documentElement.style.overflow;
    bodyPosition = body.style.position;
    bodyTop = body.style.top;
    bodyLeft = body.style.left;
    bodyRight = body.style.right;
    bodyWidth = body.style.width;
    bodyOverflow = body.style.overflow;

    documentElement.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    isPageScrollLocked = true;
  }

  function unlockPageScroll() {
    if (typeof window === 'undefined' || !isPageScrollLocked) return;

    const { documentElement, body } = document;
    documentElement.style.overflow = documentOverflow;
    body.style.position = bodyPosition;
    body.style.top = bodyTop;
    body.style.left = bodyLeft;
    body.style.right = bodyRight;
    body.style.width = bodyWidth;
    body.style.overflow = bodyOverflow;
    window.scrollTo(0, scrollY);
    isPageScrollLocked = false;
  }

  async function openPreview() {
    lockPageScroll();
    await nextTick();
    previewDialog.value?.showModal();
  }

  function closePreview() {
    previewDialog.value?.close();
  }

  onMounted(() => {
    if (nuxtApp.$reducedMotion || !root.value) return;
    ctx = gsap.context(() => {
      gsap.from('.report-preview', {
        y: 24,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: { trigger: root.value, start: 'top 75%', once: true },
      });
    }, root.value);
  });

  onBeforeUnmount(() => {
    ctx?.revert();
    unlockPageScroll();
  });
</script>

<template>
  <section id="report" ref="root" class="report">
    <div class="report__inner l-container">
      <SectionHeading
        :eyebrow="report.eyebrow"
        :title="report.title"
        :lead="report.lead"
      />

      <article class="report-preview" data-reveal>
        <div class="report-preview__topbar">
          <div>
            <span class="report-preview__kicker">{{ report.preview.title }}</span>
            <h3>{{ report.verdict }}</h3>
          </div>
          <span class="report-preview__score l-tnum">
            {{ report.score }}<small>/100</small>
          </span>
        </div>

        <p class="report-preview__summary">{{ report.scoreNote }}</p>

        <div class="report-preview__overview">
          <section class="preview-panel">
            <span class="preview-panel__label">Критерии</span>
            <div v-for="metric in report.metrics" :key="metric.label" class="metric">
              <div class="metric__head">
                <span>{{ metric.label }}</span>
                <strong class="l-tnum">{{ metric.value }}</strong>
              </div>
              <div class="metric__track" aria-hidden="true">
                <span :style="{ width: `${metric.value}%` }" />
              </div>
            </div>
          </section>

          <section class="preview-panel preview-panel--fixes">
            <span class="preview-panel__label">{{ report.fixesLabel }}</span>
            <ol>
              <li v-for="(fix, index) in report.fixes" :key="fix">
                <span>{{ index + 1 }}</span>{{ fix }}
              </li>
            </ol>
          </section>
        </div>

        <section class="report-preview__questions">
          <div class="question-list__head">
            <div>
              <span class="preview-panel__label">Разбор по вопросам</span>
              <h4>Что получилось и что тренировать дальше</h4>
            </div>
            <span class="question-list__count">{{ report.preview.questions.length }} вопроса</span>
          </div>
          <article
            v-for="(question, index) in report.preview.questions"
            :key="question.question"
            class="preview-question"
            :class="{ 'preview-question--featured': index === 0 }"
          >
            <span class="preview-question__number">0{{ index + 1 }}</span>
            <div>
              <h5>{{ question.question }}</h5>
              <p>{{ question.answer }}</p>
              <div v-if="index === 0" class="preview-question__detail">
                <p><strong>Что получилось:</strong> {{ question.whatWorked }}</p>
                <p><strong>Что усилить:</strong> {{ question.whatWeak }}</p>
              </div>
            </div>
            <span class="preview-question__average">{{ index === 0 ? '72' : '68' }}</span>
          </article>
        </section>

        <button type="button" class="report-preview__cta" @click="openPreview">
          {{ report.previewCta }}
          <span aria-hidden="true">↗</span>
        </button>
      </article>
    </div>

    <dialog
      ref="previewDialog"
      class="report-preview-dialog"
      @cancel="closePreview"
      @close="unlockPageScroll"
    >
      <div class="report-preview-dialog__header">
        <div>
          <span class="report-preview__kicker">{{ report.preview.title }}</span>
          <h2>{{ report.preview.subtitle }}</h2>
        </div>
        <button type="button" class="dialog-close" aria-label="Закрыть пример отчёта" @click="closePreview">×</button>
      </div>

      <div class="report-preview-dialog__body" data-lenis-prevent>
        <section class="dialog-hero">
          <div>
            <span class="preview-panel__label">Итоговый балл</span>
            <strong>{{ report.score }}<small>/100</small></strong>
          </div>
          <div>
            <h3>{{ report.verdict }}</h3>
            <p>{{ report.scoreNote }}</p>
          </div>
        </section>

        <div class="dialog-overview">
          <section class="preview-panel">
            <span class="preview-panel__label">Критерии</span>
            <div v-for="metric in report.metrics" :key="metric.label" class="metric">
              <div class="metric__head"><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong></div>
              <div class="metric__track" aria-hidden="true"><span :style="{ width: `${metric.value}%` }" /></div>
            </div>
          </section>
          <section class="preview-panel preview-panel--fixes">
            <span class="preview-panel__label">{{ report.fixesLabel }}</span>
            <ol><li v-for="(fix, index) in report.fixes" :key="fix"><span>{{ index + 1 }}</span>{{ fix }}</li></ol>
          </section>
        </div>

        <section class="dialog-questions">
          <div class="question-list__head">
            <div><span class="preview-panel__label">Разбор по вопросам</span><h3>Детали каждого ответа</h3></div>
            <span class="question-list__count">{{ report.preview.questions.length }} вопроса</span>
          </div>
          <article v-for="(question, index) in report.preview.questions" :key="question.question" class="dialog-question">
            <span class="preview-question__number">0{{ index + 1 }}</span>
            <div class="dialog-question__content">
              <h4>{{ question.question }}</h4>
              <section><span>Ваш ответ</span><p>{{ question.answer }}</p></section>
              <div class="dialog-question__insights">
                <p><strong>Что получилось</strong>{{ question.whatWorked }}</p>
                <p><strong>Что усилить</strong>{{ question.whatWeak }}</p>
              </div>
              <section class="dialog-question__model"><span>Вариант сильного ответа</span><p>{{ question.modelAnswer }}</p></section>
              <p class="dialog-question__practice"><strong>Как усилить ответ:</strong> {{ question.strongerAnswer }}</p>
              <p class="dialog-question__practice"><strong>Следующая тренировка:</strong> {{ question.nextPractice }}</p>
            </div>
          </article>
        </section>
      </div>

      <footer class="report-preview-dialog__footer">
        <a :href="report.examplePdfSrc" target="_blank" rel="noopener">Открыть PDF-пример</a>
        <button type="button" class="dialog-done" @click="closePreview">Понятно</button>
      </footer>
    </dialog>
  </section>
</template>

<style scoped>
  .report { padding-block: var(--l-section-y); }
  .report__inner { display: flex; flex-direction: column; gap: clamp(36px, 5vw, 60px); }
  .report-preview { overflow: hidden; border: 1px solid var(--l-line-hi); border-radius: var(--l-r-xl); background: var(--l-bg-elevated); box-shadow: var(--l-shadow); }
  .report-preview__topbar, .report-preview__overview, .report-preview__questions, .report-preview__summary { padding-inline: clamp(22px, 4vw, 48px); }
  .report-preview__topbar { display: flex; justify-content: space-between; gap: 24px; align-items: center; padding-block: clamp(22px, 3vw, 32px); border-bottom: 1px solid var(--l-line); }
  .report-preview__kicker, .preview-panel__label { display: block; color: var(--l-warm); font-size: var(--l-fs-label); letter-spacing: .08em; text-transform: uppercase; }
  .report-preview__topbar h3 { margin-top: 7px; font-size: var(--l-fs-h3); }
  .report-preview__score { flex: none; font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; line-height: 1; }
  .report-preview__score small, .dialog-hero small { margin-left: 3px; color: var(--l-text-mut); font-size: var(--l-fs-sm); font-weight: 400; }
  .report-preview__summary { padding-block: 18px; color: var(--l-text-soft); font-size: var(--l-fs-sm); }
  .report-preview__overview, .dialog-overview { display: grid; grid-template-columns: 1.1fr .9fr; gap: 1px; background: var(--l-line); border-block: 1px solid var(--l-line); }
  .preview-panel { padding: 24px; background: var(--l-bg-elevated); }
  .preview-panel--fixes { background: var(--l-bg-deep); }
  .metric { margin-top: 16px; }
  .metric__head { display: flex; justify-content: space-between; align-items: baseline; color: var(--l-text-soft); font-size: var(--l-fs-sm); }
  .metric__head strong { color: var(--l-text); }
  .metric__track { height: 7px; margin-top: 7px; overflow: hidden; border-radius: var(--l-r-pill); background: oklch(1 0 0 / .08); }
  .metric__track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--l-warm-strong), var(--l-warm)); }
  ol { padding: 0; margin: 16px 0 0; list-style: none; }
  li { display: grid; grid-template-columns: 22px 1fr; gap: 9px; color: var(--l-text-soft); font-size: var(--l-fs-sm); }
  li + li { margin-top: 13px; }
  li > span { color: var(--l-warm); font-weight: 600; }
  .report-preview__questions { padding-block: clamp(24px, 4vw, 44px); }
  .question-list__head { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 18px; }
  .question-list__head h3, .question-list__head h4 { margin-top: 6px; font-size: var(--l-fs-h3); }
  .question-list__count { color: var(--l-text-mut); font-size: var(--l-fs-sm); white-space: nowrap; }
  .preview-question { display: grid; grid-template-columns: 34px 1fr auto; gap: 14px; padding: 16px; border: 1px solid var(--l-line); border-radius: var(--l-r); background: var(--l-bg-deep); }
  .preview-question + .preview-question { margin-top: 10px; }
  .preview-question--featured { border-color: var(--l-line-warm); }
  .preview-question__number { color: var(--l-warm); font-size: var(--l-fs-sm); }
  .preview-question h5, .dialog-question h4 { font-size: 1rem; line-height: 1.4; }
  .preview-question p { margin-top: 5px; color: var(--l-text-mut); font-size: var(--l-fs-sm); line-height: 1.55; }
  .preview-question__detail { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
  .preview-question__detail p { color: var(--l-text-soft); }
  .preview-question__detail strong { display: block; color: var(--l-text); }
  .preview-question__average { align-self: start; padding: 3px 8px; border-radius: var(--l-r-pill); background: oklch(.82 .135 63 / .12); color: var(--l-warm); font-size: var(--l-fs-sm); }
  .report-preview__cta { display: flex; width: 100%; justify-content: center; align-items: center; gap: 10px; padding: 19px; border: 0; border-top: 1px solid var(--l-line); background: oklch(.82 .135 63 / .1); color: var(--l-warm); font-weight: 600; transition: background var(--l-dur-1) var(--l-ease); }
  .report-preview__cta:hover { background: oklch(.82 .135 63 / .17); }
  .report-preview__cta span { font-size: 1.2em; }
  .report-preview-dialog:not([open]) { display: none; }
  .report-preview-dialog[open] { display: flex; }
  .report-preview-dialog { flex-direction: column; width: calc(100vw - 64px); height: calc(100vh - 64px); max-width: none; max-height: none; margin: auto; padding: 0; overflow: hidden; border: 1px solid var(--l-line-hi); border-radius: var(--l-r-xl); color: var(--l-text); background: var(--l-bg); box-shadow: var(--l-shadow); }
  .report-preview-dialog::backdrop { background: oklch(.08 .01 260 / .78); backdrop-filter: blur(7px); }
  .report-preview-dialog__header, .report-preview-dialog__footer { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 20px; padding: 22px clamp(22px, 4vw, 38px); background: var(--l-bg-elevated); }
  .report-preview-dialog__header { border-bottom: 1px solid var(--l-line); }
  .report-preview-dialog__header h2 { margin-top: 5px; font-size: var(--l-fs-h3); }
  .dialog-close, .dialog-done { display: grid; flex: none; place-items: center; border: 1px solid var(--l-line-hi); border-radius: var(--l-r-sm); background: var(--l-surface); }
  .dialog-close { width: 38px; height: 38px; font-size: 1.7rem; line-height: 1; }
  .dialog-done { padding: 10px 16px; color: var(--l-warm-ink); background: var(--l-warm); font-weight: 600; }
  .report-preview-dialog__body { flex: 1; min-height: 0; padding: clamp(18px, 3vw, 34px); overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
  .dialog-hero { display: grid; grid-template-columns: 180px 1fr; gap: 26px; padding: 25px; border: 1px solid var(--l-line); border-radius: var(--l-r-lg); background: var(--l-bg-elevated); }
  .dialog-hero > div:first-child strong { display: block; margin-top: 5px; font-size: 3rem; line-height: 1; }
  .dialog-hero h3 { font-size: var(--l-fs-h3); }
  .dialog-hero p { margin-top: 9px; color: var(--l-text-soft); }
  .dialog-overview { margin-top: 18px; border: 1px solid var(--l-line); border-radius: var(--l-r-lg); overflow: hidden; }
  .dialog-questions { margin-top: 28px; }
  .dialog-question { display: grid; grid-template-columns: 38px 1fr; gap: 13px; padding: 23px 0; border-top: 1px solid var(--l-line); }
  .dialog-question__content > section { margin-top: 15px; padding: 14px; border-radius: var(--l-r-sm); background: var(--l-bg-elevated); }
  .dialog-question__content section > span { display: block; color: var(--l-text-mut); font-size: var(--l-fs-label); text-transform: uppercase; letter-spacing: .07em; }
  .dialog-question__content section p, .dialog-question__practice { margin-top: 6px; color: var(--l-text-soft); font-size: var(--l-fs-sm); }
  .dialog-question__insights { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
  .dialog-question__insights p { padding: 13px; border-left: 2px solid var(--l-warm); background: oklch(.82 .135 63 / .07); color: var(--l-text-soft); font-size: var(--l-fs-sm); }
  .dialog-question__insights strong { display: block; margin-bottom: 4px; color: var(--l-text); }
  .dialog-question__model { border: 1px solid oklch(.85 .095 200 / .25); background: oklch(.85 .095 200 / .07) !important; }
  .dialog-question__practice strong { color: var(--l-text); }
  .report-preview-dialog__footer { border-top: 1px solid var(--l-line); }
  .report-preview-dialog__footer a { color: var(--l-warm); font-size: var(--l-fs-sm); }
  @media (max-width: 680px) { .report-preview__overview, .dialog-overview, .dialog-hero, .preview-question__detail, .dialog-question__insights { grid-template-columns: 1fr; } .preview-question { grid-template-columns: 28px 1fr; } .preview-question__average { display: none; } .dialog-hero > div:first-child strong { font-size: 2.4rem; } .report-preview-dialog { width: calc(100vw - 32px); height: calc(100vh - 32px); } }
</style>
