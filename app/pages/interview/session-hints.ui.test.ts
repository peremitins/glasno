import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/pages/interview/[id].vue', 'utf8');

describe('interview session hints panel', () => {
  it('loads detailed hints on demand through the hints endpoint', () => {
    expect(source).toContain('generateHintsForCurrentTurn');
    expect(source).toContain('/hints');
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('loadedHintRequestKeys');
  });

  it('renders skeleton loading, error, and retry states without blocking the interview', () => {
    expect(source).toContain('hintsLoading');
    expect(source).toContain('hintsError');
    expect(source).toContain('retryHints');
    expect(source).toContain('GlassSkeletonStack');
    expect(source).toContain('interview.session.hintsPanel.loading');
    expect(source).toContain('interview.session.hintsPanel.retry');
  });

  it('does not replace an active interview with a page skeleton during state refreshes', () => {
    expect(source).toContain('sessionInitialPending');
    expect(source).toContain('pending.value && !state.value');
    expect(source).toContain('v-if="sessionInitialPending"');
  });

  it('uses a compact work header without redundant navigation or mode copy', () => {
    expect(source).toContain('session-compact-header');
    expect(source).toContain('session-compact-title');
    expect(source).toContain('session-compact-meta');
    expect(source).not.toContain('interview.session.back');
    expect(source).not.toContain('interview.session.subtitle');
    expect(source).not.toContain('inline-back');
  });

  it('merges current-question guidance and general structure into one collapsible answer block', () => {
    expect(source).toContain('hint-disclosure--primary');
    expect(source).toContain('interview.session.hintsPanel.answerPlan');
    expect(source).toContain('interview.session.hintsPanel.keyDefinitions');
    expect(source).toContain('interview.session.hintsPanel.answerStructure');
    expect(source).not.toContain('interview.session.hintsPanel.generalStructure');
    expect(source).not.toContain('class="hint-focus"');
  });

  it('keeps the sample answer as a separate disclosure', () => {
    expect(source).toContain('interview.session.hintsPanel.sampleAnswer');
    expect(source).toContain('hint-disclosure');
  });

  it('opens the answer guidance and sample answer disclosures by default', () => {
    expect(source).toMatch(
      /class="hint-disclosure hint-disclosure--primary"[\s\S]*?\n\s+open/
    );
    expect(source).toMatch(
      /v-if="currentHintDetails\?\.sampleAnswer"[\s\S]*?class="hint-disclosure"[\s\S]*?\n\s+open/
    );
    expect(source).toMatch(/<details class="plan-disclosure">/);
  });

  it('submits the composer on Enter and leaves Shift Enter for line breaks', () => {
    expect(source).toContain('handleComposerKeydown');
    expect(source).toContain('event.shiftKey');
    expect(source).toContain('event.preventDefault()');
    expect(source).toContain('@keydown.enter="handleComposerKeydown"');
  });

  it('refreshes sample-answer hints when the interviewer asks a follow-up', () => {
    expect(source).toContain('currentHintsRequestKey');
    expect(source).toContain('latestInterviewerQuestionForHints');
    expect(source).toContain('sampleAnswerQuestion');
  });

  it('applies persisted realtime dialogue state for hint refreshes', () => {
    expect(source).toMatch(
      /state\.value = await api<InterviewStateResponse>\(\s*`\/api\/interview\/sessions\/\$\{sessionId\.value\}\/dialogue`/
    );
  });

  it('keeps realtime voice active when moving to the next question', () => {
    expect(source).toContain('isNextQuestionVoiceCommand');
    expect(source).toContain('isNextQuestionTransitionReply');
    expect(source).toContain('handleRealtimeAssistantTranscript');
    expect(source).not.toContain('realtimeAdapter.value = null');
  });

  it('uses text-only shimmer on the sample answer while follow-up hints refresh', () => {
    expect(source).toContain('hintsSampleRefreshing');
    expect(source).toContain('hint-sample--refreshing');
    expect(source).toContain('hint-text-shimmer');
    expect(source).toContain('background-clip: text');
    expect(source).not.toContain('hint-text-pulse');
  });

  it('lets sample answers finish naturally instead of showing UI ellipsis', () => {
    const hintSampleStart = source.indexOf('.hint-sample {');
    const hintSampleEnd = source.indexOf('}', hintSampleStart);
    const hintSampleBlock = source.slice(hintSampleStart, hintSampleEnd);

    expect(hintSampleBlock).toContain('overflow-wrap: anywhere');
    expect(hintSampleBlock).toContain('white-space: normal');
    expect(hintSampleBlock).not.toContain('text-overflow: ellipsis');
    expect(hintSampleBlock).not.toContain('white-space: nowrap');
    expect(hintSampleBlock).not.toContain('-webkit-line-clamp');
  });

  it('passes learning-term contexts for questions, chat messages, and hints', () => {
    expect(source).toContain('learningTermContext');
    expect(source).toContain("learningTermContext('interview_question'");
    expect(source).toContain("learningTermContext('interview_message'");
    expect(source).toContain("learningTermContext('interview_hint'");
  });
});
