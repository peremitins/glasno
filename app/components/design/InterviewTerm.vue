<script setup lang="ts">
import { Dropdown as VDropdown } from 'floating-vue';
import { Cross2Icon } from '@radix-icons/vue';
import { computed, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  ExplainLearningTermResponse,
  LearningTermCandidate,
  LearningTermContext,
} from '@/shared/dto';

const props = withDefaults(
  defineProps<{
    term?: 'star' | LearningTermCandidate;
    label?: string;
    sourceText?: string;
    context?: LearningTermContext;
    interactive?: boolean;
    explainable?: boolean;
    attachedPunctuation?: string;
  }>(),
  {
    term: 'star',
    label: '',
    sourceText: '',
    context: () => ({ kind: 'generic' }),
    interactive: true,
    attachedPunctuation: '',
  }
);

const { t } = useI18n();
const { activeTermKey, explainTerm, setActiveTermKey } = useLearningTerms();

const termMessages = {
  star: {
    label: 'common.terms.star.label',
    description: 'common.terms.star.description',
  },
} as const;

const isStaticTerm = computed(() => props.term === 'star');
const displayLabel = computed(() =>
  props.label ||
  (isStaticTerm.value
    ? t(termMessages.star.label)
    : (props.term as LearningTermCandidate).phrase)
);
const description = computed(() =>
  isStaticTerm.value
    ? t(termMessages.star.description)
    : (props.term as LearningTermCandidate).shortDefinition
);
const canExplain = computed(
  () => props.explainable ?? (props.interactive && props.term !== 'star')
);
const displayLabelParts = computed(() => displayLabel.value.split(/(\/)/u));

const explanation = ref<ExplainLearningTermResponse | null>(null);
const explanationLoading = ref(false);
const explanationError = ref('');

// Ключ уникален для инстанса: одна и та же фраза, встретившаяся в тексте
// дважды, не должна открывать оба попапа одновременно.
const termKey = `term:${useId()}`;

const isShown = computed({
  get: () => activeTermKey.value === termKey,
  set: (shown: boolean) => {
    setActiveTermKey(shown ? termKey : null);
  },
});

function closePopover() {
  // @hide прилетает и когда ключ уже занял другой термин или выделение —
  // сбрасываем состояние только если оно всё ещё наше.
  if (activeTermKey.value === termKey) {
    setActiveTermKey(null);
  }
}

watch(isShown, (shown) => {
  if (!canExplain.value) return;
  if (shown) void loadExplanation();
});

async function loadExplanation() {
  if (!canExplain.value || explanation.value || explanationLoading.value) return;

  explanationLoading.value = true;
  explanationError.value = '';
  try {
    explanation.value = await explainTerm({
      term: displayLabel.value,
      text: props.sourceText || displayLabel.value,
      shortDefinition: description.value,
      context: props.context,
    });
  } catch {
    explanationError.value = 'Не удалось загрузить объяснение. Попробуйте ещё раз.';
  } finally {
    explanationLoading.value = false;
  }
}
</script>

<template>
  <VDropdown
    v-if="canExplain"
    v-model:shown="isShown"
    class="term-popper"
    :triggers="['click']"
    :auto-hide="true"
    placement="top"
    :distance="10"
    theme="learning-term"
    @hide="closePopover"
    @auto-hide="closePopover"
    @close-directive="closePopover"
  >
    <button
      v-tooltip="{
        content: description,
        theme: 'learning-term-tooltip',
        triggers: ['hover', 'focus', 'touch'],
        placement: 'top',
      }"
      class="term-tooltip term-tooltip--button"
      type="button"
      :title="description"
      :aria-label="`${displayLabel}: ${description}`"
      @click.stop
    >
      <span class="term-tooltip__label">
        <template
          v-for="(part, index) in displayLabelParts"
          :key="`${part}-${index}`"
        >
          {{ part }}<wbr v-if="part === '/'">
        </template>
      </span><span
        v-if="attachedPunctuation"
        class="term-tooltip__punctuation"
      >{{ attachedPunctuation }}</span>
    </button>

    <template #popper>
      <article class="term-popover" role="dialog" :aria-label="displayLabel">
        <header class="term-popover__header">
          <span class="term-popover__heading">
            <span class="term-popover__kicker">Понятие</span>
            <strong>{{ explanation?.title || displayLabel }}</strong>
          </span>
          <button
            class="term-popover__close"
            type="button"
            aria-label="Закрыть объяснение"
            @click="closePopover"
          >
            <Cross2Icon aria-hidden="true" />
          </button>
        </header>
        <p v-if="explanationLoading" class="term-popover__muted">
          Загружаем объяснение...
        </p>
        <p v-else-if="explanationError" class="term-popover__error">
          {{ explanationError }}
        </p>
        <template v-else>
          <p class="term-popover__lead">
            {{ explanation?.shortDefinition || description }}
          </p>
          <p class="term-popover__body">
            {{ explanation?.explanation || description }}
          </p>
        </template>
      </article>
    </template>
  </VDropdown>

  <span
    v-else
    v-tooltip="{
      content: description,
      theme: 'learning-term-tooltip',
      triggers: ['hover', 'focus', 'click', 'touch'],
      placement: 'top',
    }"
    class="term-tooltip"
    :title="description"
    tabindex="0"
    @click.stop
  >
    <span class="term-tooltip__label">
      <template
        v-for="(part, index) in displayLabelParts"
        :key="`${part}-${index}`"
      >
        {{ part }}<wbr v-if="part === '/'">
      </template>
    </span><span
      v-if="attachedPunctuation"
      class="term-tooltip__punctuation"
    >{{ attachedPunctuation }}</span>
  </span>
</template>

<style scoped>
.term-tooltip {
  display: inline;
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--accent-2);
  cursor: help;
  font: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  line-height: inherit;
  padding: 0;
  text-align: left;
  vertical-align: baseline;
  white-space: normal;
  word-break: normal;
  overflow-wrap: anywhere;
}

.term-tooltip__label {
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  overflow-wrap: anywhere;
}

.term-tooltip__punctuation::before {
  content: '\2060';
}

.term-tooltip--button {
  cursor: pointer;
}

.term-tooltip:focus-visible {
  border-radius: 4px;
  outline: 2px solid color-mix(in srgb, var(--accent-2) 62%, transparent);
  outline-offset: 2px;
}

.term-popover {
  display: grid;
  gap: 10px;
  width: min(360px, calc(100vw - 32px));
  color: var(--text-primary);
}

.term-popover__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
}

.term-popover__heading {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.term-popover__kicker {
  color: var(--accent-2);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.term-popover strong {
  font-size: 15px;
}

.term-popover p {
  margin: 0;
  line-height: 1.45;
}

.term-popover__lead {
  color: var(--text-primary);
  font-weight: 800;
}

.term-popover__body,
.term-popover__muted {
  color: var(--text-secondary);
  font-size: 13px;
}

.term-popover__error {
  color: var(--danger);
  font-size: 13px;
  font-weight: 800;
}

.term-popover__close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: var(--surface-soft);
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
}

.term-popover__close:hover,
.term-popover__close:focus-visible {
  color: var(--text-primary);
  border-color: var(--glass-border-strong);
}

.term-popover__close svg {
  width: 14px;
  height: 14px;
}

:global(.term-popper.v-popper) {
  display: inline;
}

:global(.v-popper--theme-learning-term .v-popper__inner) {
  max-width: min(380px, calc(100vw - 32px)) !important;
  padding: 14px !important;
  border: 1px solid var(--glass-border-strong) !important;
  border-radius: var(--radius-xs) !important;
  background: var(--surface-solid) !important;
  box-shadow: var(--shadow-panel) !important;
  backdrop-filter: none !important;
}

:global(.v-popper--theme-learning-term-tooltip .v-popper__inner) {
  max-width: min(320px, calc(100vw - 32px)) !important;
  padding: 8px 10px !important;
  border: 1px solid var(--glass-border-strong) !important;
  border-radius: var(--radius-xs) !important;
  background: var(--surface-solid) !important;
  color: var(--text-primary) !important;
  box-shadow: var(--shadow-panel) !important;
  backdrop-filter: none !important;
}

:global(.v-popper--theme-learning-term-tooltip .v-popper__arrow-container),
:global(.v-popper--theme-learning-term-tooltip .v-popper__arrow-inner),
:global(.v-popper--theme-learning-term-tooltip .v-popper__arrow-outer) {
  display: none !important;
}

:global(.v-popper--theme-learning-term .v-popper__arrow-container),
:global(.v-popper--theme-learning-term .v-popper__arrow-inner),
:global(.v-popper--theme-learning-term .v-popper__arrow-outer) {
  display: none !important;
}
</style>
