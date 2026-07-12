<script setup lang="ts">
  import { ref, watch } from 'vue';
  import type {
    QuestionPreference,
    QuestionPreferenceStatus,
  } from '@/shared/dto';
  import QuestionPreferenceMenu from './QuestionPreferenceMenu.vue';

  const props = defineProps<{
    sessionId: string;
    turnId: string;
    modelValue: QuestionPreferenceStatus | null;
  }>();
  const emit = defineEmits<{
    updated: [preference: QuestionPreference];
  }>();
  const api = useAPI();
  const currentStatus = ref<QuestionPreferenceStatus | null>(props.modelValue);
  const loading = ref(false);
  const feedback = ref('');

  watch(
    () => props.modelValue,
    (value) => {
      currentStatus.value = value;
    }
  );

  async function selectStatus(status: QuestionPreferenceStatus) {
    if (loading.value || currentStatus.value === status) return;
    loading.value = true;
    feedback.value = '';
    try {
      const preference = await api<QuestionPreference>(
        `/api/interview/sessions/${props.sessionId}/question-preference`,
        { method: 'POST', body: { turnId: props.turnId, status } }
      );
      currentStatus.value = preference.status;
      feedback.value = 'Настройка сохранена';
      emit('updated', preference);
    } catch {
      feedback.value = 'Не удалось сохранить настройку';
    } finally {
      loading.value = false;
    }
  }
</script>

<template>
  <div class="question-preference-control">
    <QuestionPreferenceMenu
      :model-value="currentStatus"
      :loading="loading"
      compact
      @select="selectStatus"
    />
    <span class="sr-only" aria-live="polite">{{ feedback }}</span>
  </div>
</template>
