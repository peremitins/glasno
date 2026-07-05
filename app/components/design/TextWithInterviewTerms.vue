<script setup lang="ts">
import { Cross2Icon, MagicWandIcon } from '@radix-icons/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import InterviewTerm from './InterviewTerm.vue';
import {
  learningTermContextKey,
  learningTermTextHash,
} from '@/app/composables/useLearningTerms';
import {
  prepareInterviewTextDisplaySegments,
  splitTextByInterviewTerms,
} from '@/app/utils/interviewTerms';
import {
  clampLearningTermFloatingPosition,
  isEditableLearningTermSelectionTarget,
  normalizeManualLearningTermSelection,
} from '@/app/utils/learningTermSelection';
import type {
  ExplainLearningTermResponse,
  LearningTermCandidate,
  LearningTermContext,
} from '@/shared/dto';

const props = withDefaults(
  defineProps<{
    text: string;
    context?: LearningTermContext;
    interactive?: boolean;
    manualSelection?: boolean;
    // Автоподсветка терминов (и её LLM-извлечение). Выключаем для текстов,
    // которые пользователь написал сам, — там подсказки не нужны и только
    // тратят вызовы; ручное «Объяснить» по выделению продолжает работать.
    highlightTerms?: boolean;
  }>(),
  {
    context: () => ({ kind: 'generic' }),
    interactive: true,
    manualSelection: false,
    highlightTerms: true,
  }
);

const dynamicTerms = ref<LearningTermCandidate[]>([]);
const { activeTermKey, extractTermsForText, explainTerm, setActiveTermKey } =
  useLearningTerms();

type FloatingPosition = {
  left: number;
  top: number;
};

type ManualSelectionMode = 'action' | 'popover';

const manualSelectionRoot = ref<HTMLElement | null>(null);
const manualSelectionAction = ref<HTMLElement | null>(null);
const manualSelectionPopover = ref<HTMLElement | null>(null);
const manualSelectionMode = ref<ManualSelectionMode | null>(null);
const manualSelectedText = ref('');
const manualSelectionRect = ref<DOMRectReadOnly | null>(null);
const manualActionPosition = ref<FloatingPosition | null>(null);
const manualPopoverPosition = ref<FloatingPosition | null>(null);
const manualExplanation = ref<ExplainLearningTermResponse | null>(null);
const manualExplanationLoading = ref(false);
const manualExplanationError = ref('');

let loadTimer: number | null = null;
let stopWatch: (() => void) | null = null;
let loadVersion = 0;
let explainVersion = 0;
let visibilityObserver: IntersectionObserver | null = null;
const hasBeenVisible = ref(false);

const segments = computed(() =>
  props.highlightTerms
    ? splitTextByInterviewTerms(props.text, dynamicTerms.value)
    : [{ kind: 'text' as const, value: props.text }]
);
const displaySegments = computed(() =>
  prepareInterviewTextDisplaySegments(segments.value)
);
const manualSelectionKey = computed(() =>
  [
    'manual-selection',
    learningTermTextHash(props.text),
    learningTermTextHash(learningTermContextKey(props.context)),
  ].join(':')
);
const manualActionStyle = computed(() =>
  manualActionPosition.value
    ? {
        left: `${manualActionPosition.value.left}px`,
        top: `${manualActionPosition.value.top}px`,
      }
    : {}
);
const manualPopoverStyle = computed(() =>
  manualPopoverPosition.value
    ? {
        left: `${manualPopoverPosition.value.left}px`,
        top: `${manualPopoverPosition.value.top}px`,
      }
    : {}
);

function clearLoadTimer() {
  if (!loadTimer) return;
  window.clearTimeout(loadTimer);
  loadTimer = null;
}

function scheduleTermLoad() {
  if (typeof window === 'undefined' || !props.highlightTerms) return;
  clearLoadTimer();
  const version = ++loadVersion;
  loadTimer = window.setTimeout(async () => {
    const text = props.text;
    const context = props.context;
    try {
      const terms = await extractTermsForText({ text, context });
      if (version === loadVersion) {
        dynamicTerms.value = terms;
      }
    } catch {
      if (version === loadVersion) {
        dynamicTerms.value = filterTermsForText(dynamicTerms.value, text);
      }
    }
  }, 700);
}

function filterTermsForText(
  terms: LearningTermCandidate[],
  text: string
): LearningTermCandidate[] {
  const source = text.toLocaleLowerCase();
  return terms.filter((term) =>
    source.includes(term.phrase.trim().toLocaleLowerCase())
  );
}

function handleManualSelectionRequest(event: Event) {
  if (!props.manualSelection || typeof window === 'undefined') return;
  if (isEditableLearningTermSelectionTarget(event.target)) return;
  if (isManualSelectionUiTarget(event.target)) return;

  window.setTimeout(readManualSelection, 0);
}

function readManualSelection() {
  const root = manualSelectionRoot.value;
  const selection = window.getSelection();
  if (!root || !selection || selection.rangeCount < 1 || selection.isCollapsed) {
    if (manualSelectionMode.value === 'action') closeManualSelection();
    return;
  }

  const selectedText = normalizeManualLearningTermSelection(
    selection.toString()
  );
  if (!selectedText || !isSelectionInsideRoot(selection, root)) {
    if (manualSelectionMode.value === 'action') closeManualSelection();
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = getSelectionRect(range);
  if (!rect) {
    if (manualSelectionMode.value === 'action') closeManualSelection();
    return;
  }

  manualSelectedText.value = selectedText;
  manualSelectionRect.value = rect;
  manualExplanation.value = null;
  manualExplanationError.value = '';
  manualExplanationLoading.value = false;
  manualActionPosition.value = positionFromSelection(rect, {
    width: 132,
    height: 34,
  });
  manualPopoverPosition.value = null;
  manualSelectionMode.value = 'action';
  addManualSelectionListeners();
  setActiveTermKey(manualSelectionKey.value);
}

async function explainManualSelection() {
  if (!manualSelectedText.value || !manualSelectionRect.value) return;

  manualSelectionMode.value = 'popover';
  manualPopoverPosition.value = positionFromSelection(manualSelectionRect.value, {
    width: 360,
    height: 240,
  });
  manualActionPosition.value = null;
  manualExplanation.value = null;
  manualExplanationError.value = '';
  manualExplanationLoading.value = true;
  setActiveTermKey(manualSelectionKey.value);

  // Запоздалый ответ по прошлому выделению не должен перезаписать текущее.
  const version = ++explainVersion;
  try {
    const response = await explainTerm({
      term: manualSelectedText.value,
      text: props.text || manualSelectedText.value,
      shortDefinition: 'Понятие из выделенного текста.',
      context: props.context,
    });
    if (version === explainVersion) {
      manualExplanation.value = response;
    }
  } catch {
    if (version === explainVersion) {
      manualExplanationError.value =
        'Не удалось загрузить объяснение. Попробуйте ещё раз.';
    }
  } finally {
    if (version === explainVersion) {
      manualExplanationLoading.value = false;
    }
  }
}

function closeManualSelection(options: { syncActiveKey?: boolean } = {}) {
  explainVersion += 1;
  removeManualSelectionListeners();
  manualSelectionMode.value = null;
  manualSelectedText.value = '';
  manualSelectionRect.value = null;
  manualActionPosition.value = null;
  manualPopoverPosition.value = null;
  manualExplanation.value = null;
  manualExplanationError.value = '';
  manualExplanationLoading.value = false;
  if (
    options.syncActiveKey !== false &&
    activeTermKey.value === manualSelectionKey.value
  ) {
    setActiveTermKey(null);
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!manualSelectionMode.value) return;
  const target = event.target;
  if (
    containsEventTarget(manualSelectionAction.value, target) ||
    containsEventTarget(manualSelectionPopover.value, target)
  ) {
    return;
  }
  closeManualSelection();
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeManualSelection();
}

function handleViewportChange() {
  if (manualSelectionMode.value) closeManualSelection();
}

function addManualSelectionListeners() {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  document.addEventListener('keydown', handleDocumentKeydown);
  window.addEventListener('scroll', handleViewportChange, true);
  window.addEventListener('resize', handleViewportChange);
}

function removeManualSelectionListeners() {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  document.removeEventListener('keydown', handleDocumentKeydown);
  window.removeEventListener('scroll', handleViewportChange, true);
  window.removeEventListener('resize', handleViewportChange);
}

function positionFromSelection(
  rect: DOMRectReadOnly,
  floatingSize: { width: number; height: number }
): FloatingPosition {
  return clampLearningTermFloatingPosition({
    anchorRect: rect,
    floatingSize,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    offset: 8,
    margin: 8,
  });
}

function getSelectionRect(range: Range): DOMRectReadOnly | null {
  const rect =
    Array.from(range.getClientRects()).find(
      (item) => item.width > 0 && item.height > 0
    ) ?? range.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

function isSelectionInsideRoot(selection: Selection, root: HTMLElement): boolean {
  return (
    isNodeInsideRoot(selection.anchorNode, root) &&
    isNodeInsideRoot(selection.focusNode, root) &&
    isNodeInsideRoot(selection.getRangeAt(0).commonAncestorContainer, root)
  );
}

function isNodeInsideRoot(node: Node | null, root: HTMLElement): boolean {
  if (!node) return false;
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element && root.contains(element));
}

function containsEventTarget(
  element: HTMLElement | null,
  target: EventTarget | null
): boolean {
  return Boolean(target instanceof Node && element?.contains(target));
}

function isManualSelectionUiTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      '.manual-selection-action, .manual-selection-popover, .v-popper'
    )
  );
}

// Экстракция терминов стоит LLM-вызова: запускаем её только после того, как
// блок реально показался на экране — списки и офскрин-контент не тратят квоту.
function setupVisibilityObserver() {
  const root = manualSelectionRoot.value;
  if (typeof IntersectionObserver === 'undefined' || !root) {
    hasBeenVisible.value = true;
    return;
  }
  visibilityObserver = new IntersectionObserver(
    (observed) => {
      if (!observed.some((entry) => entry.isIntersecting)) return;
      hasBeenVisible.value = true;
      visibilityObserver?.disconnect();
      visibilityObserver = null;
    },
    { rootMargin: '200px' }
  );
  visibilityObserver.observe(root);
}

onMounted(() => {
  setupVisibilityObserver();
  stopWatch = watch(
    () => [props.text, JSON.stringify(props.context)] as const,
    () => {
      dynamicTerms.value = filterTermsForText(dynamicTerms.value, props.text);
      closeManualSelection();
      if (hasBeenVisible.value) scheduleTermLoad();
    },
    { immediate: true }
  );
});

watch(hasBeenVisible, (visible) => {
  if (visible) scheduleTermLoad();
});

watch(activeTermKey, (key) => {
  if (manualSelectionMode.value && key !== manualSelectionKey.value) {
    closeManualSelection({ syncActiveKey: false });
  }
});

onBeforeUnmount(() => {
  stopWatch?.();
  clearLoadTimer();
  removeManualSelectionListeners();
  visibilityObserver?.disconnect();
  visibilityObserver = null;
});
</script>

<template>
  <span
    ref="manualSelectionRoot"
    class="text-with-interview-terms"
    :class="{ 'text-with-interview-terms--manual': manualSelection }"
    @mouseup="handleManualSelectionRequest"
    @touchend="handleManualSelectionRequest"
    @keyup="handleManualSelectionRequest"
  >
    <template
      v-for="(segment, index) in displaySegments"
      :key="`${segment.kind}-${index}-${segment.value}`"
    >
      <InterviewTerm
        v-if="segment.kind === 'term'"
        :term="segment.term"
        :label="segment.value"
        :source-text="text"
        :context="context"
        :interactive="interactive"
        :explainable="segment.term !== 'star'"
        :attached-punctuation="segment.attachedPunctuation"
      />
      <template v-else>{{ segment.value }}</template>
    </template>

    <Teleport v-if="manualSelection" to="body">
      <button
        v-if="manualSelectionMode === 'action' && manualActionPosition"
        ref="manualSelectionAction"
        class="manual-selection-action"
        type="button"
        :style="manualActionStyle"
        @mousedown.prevent.stop
        @click.stop="explainManualSelection"
      >
        <MagicWandIcon aria-hidden="true" />
        <span>Объяснить</span>
      </button>

      <article
        v-if="manualSelectionMode === 'popover' && manualPopoverPosition"
        ref="manualSelectionPopover"
        class="manual-selection-popover"
        role="dialog"
        :aria-label="manualSelectedText"
        :style="manualPopoverStyle"
        @mousedown.stop
        @click.stop
      >
        <header class="manual-selection-popover__header">
          <span class="manual-selection-popover__heading">
            <span class="manual-selection-popover__kicker">Понятие</span>
            <strong>{{
              manualExplanation?.title || manualSelectedText
            }}</strong>
          </span>
          <button
            class="manual-selection-popover__close"
            type="button"
            aria-label="Закрыть объяснение"
            @click="closeManualSelection()"
          >
            <Cross2Icon aria-hidden="true" />
          </button>
        </header>

        <p v-if="manualExplanationLoading" class="manual-selection-popover__muted">
          Загружаем объяснение...
        </p>
        <p v-else-if="manualExplanationError" class="manual-selection-popover__error">
          {{ manualExplanationError }}
        </p>
        <template v-else>
          <p class="manual-selection-popover__lead">
            {{
              manualExplanation?.shortDefinition ||
              'Понятие из выделенного текста.'
            }}
          </p>
          <p class="manual-selection-popover__body">
            {{
              manualExplanation?.explanation ||
              'Выделите текст и нажмите «Объяснить», чтобы получить разбор.'
            }}
          </p>
        </template>
      </article>
    </Teleport>
  </span>
</template>

<style scoped>
.text-with-interview-terms {
  display: inline;
}

.manual-selection-action,
.manual-selection-popover {
  position: fixed;
  z-index: 360;
}

.manual-selection-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--glass-border-strong);
  border-radius: 999px;
  background: var(--surface-solid);
  color: var(--text-primary);
  box-shadow: var(--shadow-panel);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
}

.manual-selection-action:hover,
.manual-selection-action:focus-visible {
  border-color: color-mix(in srgb, var(--accent-2) 56%, var(--glass-border));
  color: var(--accent-2);
  outline: none;
}

.manual-selection-action svg {
  width: 14px;
  height: 14px;
}

.manual-selection-popover {
  display: grid;
  gap: 10px;
  width: min(360px, calc(100vw - 16px));
  padding: 14px;
  border: 1px solid var(--glass-border-strong);
  border-radius: var(--radius-xs);
  background: var(--surface-solid);
  box-shadow: var(--shadow-panel);
  color: var(--text-primary);
}

.manual-selection-popover__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
}

.manual-selection-popover__heading {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.manual-selection-popover__kicker {
  color: var(--accent-2);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.manual-selection-popover strong {
  font-size: 15px;
  word-break: break-word;
}

.manual-selection-popover p {
  margin: 0;
  line-height: 1.45;
}

.manual-selection-popover__lead {
  color: var(--text-primary);
  font-weight: 800;
}

.manual-selection-popover__body,
.manual-selection-popover__muted {
  color: var(--text-secondary);
  font-size: 13px;
}

.manual-selection-popover__error {
  color: var(--danger);
  font-size: 13px;
  font-weight: 800;
}

.manual-selection-popover__close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: var(--surface-soft);
  color: var(--text-muted);
  cursor: pointer;
}

.manual-selection-popover__close:hover,
.manual-selection-popover__close:focus-visible {
  border-color: var(--glass-border-strong);
  color: var(--text-primary);
  outline: none;
}

.manual-selection-popover__close svg {
  width: 14px;
  height: 14px;
}
</style>
