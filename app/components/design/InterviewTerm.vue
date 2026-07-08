<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    term?: 'star';
    label?: string;
    attachedPunctuation?: string;
  }>(),
  {
    term: 'star',
    label: '',
    attachedPunctuation: '',
  }
);

const { t } = useI18n();

const displayLabel = computed(
  () => props.label || t('common.terms.star.label')
);
const description = computed(() => t('common.terms.star.description'));
const displayLabelParts = computed(() => displayLabel.value.split(/(\/)/u));
</script>

<template>
  <span
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

.term-tooltip:focus-visible {
  border-radius: 4px;
  outline: 2px solid color-mix(in srgb, var(--accent-2) 62%, transparent);
  outline-offset: 2px;
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
</style>
