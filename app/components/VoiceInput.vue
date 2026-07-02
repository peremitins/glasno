<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useVoiceDictationInput } from '@/app/composables/useVoiceDictationInput';

const props = defineProps<{
  modelValue: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const { t } = useI18n();
const answer = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
});

const dictation = useVoiceDictationInput({ value: answer });
const canUseDictation = computed(() => !props.disabled);
</script>

<template>
  <button
    class="mic-button"
    type="button"
    :class="{ 'mic-button--active': dictation.isListening.value }"
    :disabled="!canUseDictation"
    :aria-pressed="dictation.isListening.value"
    v-tooltip="
      dictation.isListening.value
        ? t('voice.dictation.stop')
        : t('voice.dictation.start')
    "
    @click="dictation.toggle"
  >
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
      />
    </svg>
  </button>
</template>

<style scoped>
/* Иконка-кнопка диктовки. Размер/радиус согласованы с другими кнопками
   композера (Realtime, Отправить) на экране собеседования. */
.mic-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  color: var(--text-secondary);
  background: var(--surface-soft);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    background 0.18s ease;
}

.mic-button svg {
  width: 20px;
  height: 20px;
}

.mic-button:hover {
  border-color: var(--glass-border-strong);
  color: var(--text-primary);
}

.mic-button:active {
  transform: translateY(1px);
}

.mic-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

/* Активная запись — акцентная подсветка + пульс. */
.mic-button--active {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  animation: mic-pulse 1.4s ease-in-out infinite;
}

@keyframes mic-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 32%, transparent);
  }
  50% {
    box-shadow: 0 0 0 6px transparent;
  }
}
</style>
