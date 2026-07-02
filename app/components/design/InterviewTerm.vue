<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    term?: 'star';
    label?: string;
  }>(),
  {
    term: 'star',
    label: '',
  }
);

const { t } = useI18n();

const termMessages = {
  star: {
    label: 'common.terms.star.label',
    description: 'common.terms.star.description',
  },
} as const;

const displayLabel = computed(() =>
  props.label || t(termMessages[props.term].label)
);
const description = computed(() => t(termMessages[props.term].description));
</script>

<template>
  <span
    class="term-tooltip"
    tabindex="0"
    :title="description"
    v-tooltip="{
      content: description,
      triggers: ['hover', 'focus', 'click', 'touch'],
    }"
  >
    {{ displayLabel }}
  </span>
</template>

<style scoped>
.term-tooltip {
  color: var(--accent-2);
  cursor: help;
  font-weight: 900;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.term-tooltip:focus-visible {
  border-radius: 4px;
  outline: 2px solid color-mix(in srgb, var(--accent-2) 62%, transparent);
  outline-offset: 2px;
}
</style>
