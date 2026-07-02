<script setup lang="ts">
import { computed } from 'vue';
import InterviewTerm from './InterviewTerm.vue';
import { splitTextByInterviewTerms } from '@/app/utils/interviewTerms';

const props = defineProps<{
  text: string;
}>();

const segments = computed(() => splitTextByInterviewTerms(props.text));
</script>

<template>
  <template
    v-for="(segment, index) in segments"
    :key="`${segment.kind}-${index}-${segment.value}`"
  >
    <InterviewTerm
      v-if="segment.kind === 'term'"
      :term="segment.term"
      :label="segment.value"
    />
    <template v-else>{{ segment.value }}</template>
  </template>
</template>
