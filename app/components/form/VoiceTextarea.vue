<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import VoiceInput from '@/app/components/VoiceInput.vue';

const props = withDefaults(
  defineProps<{
    id?: string;
    modelValue: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    maxlength?: number;
  }>(),
  {
    rows: 5,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

const value = computed({
  get: () => props.modelValue,
  set: (nextValue: string) => emit('update:modelValue', nextValue),
});

function resize() {
  const textarea = textareaRef.value;
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function onInput(event: Event) {
  value.value = (event.target as HTMLTextAreaElement).value;
  resize();
}

watch(
  () => props.modelValue,
  () => nextTick(resize)
);

onMounted(resize);
</script>

<template>
  <div class="voice-textarea" :class="{ 'voice-textarea--disabled': disabled }">
    <textarea
      :id="id"
      ref="textareaRef"
      class="voice-textarea__control"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      :maxlength="maxlength"
      @input="onInput"
      @focus="emit('focus', $event)"
      @blur="emit('blur', $event)"
    />
    <VoiceInput
      v-model="value"
      class="voice-textarea__mic"
      :disabled="disabled"
    />
  </div>
</template>

<style scoped>
.voice-textarea {
  position: relative;
  width: 100%;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-control);
  background: var(--surface-soft);
  transition:
    background var(--motion-normal) var(--ease-out),
    border-color var(--motion-normal) var(--ease-out),
    box-shadow var(--motion-normal) var(--ease-out);
}

.voice-textarea:focus-within {
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--focus-ring) 18%, transparent);
  background: var(--surface-raised);
}

.voice-textarea--disabled {
  opacity: 0.62;
}

.voice-textarea__control {
  display: block;
  width: 100%;
  min-height: 132px;
  max-height: 380px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  line-height: 1.45;
  outline: 0;
  overflow-y: auto;
  padding: 14px 66px 14px 15px;
  resize: vertical;
}

.voice-textarea__control::placeholder {
  color: var(--text-muted);
}

.voice-textarea__mic {
  position: absolute;
  right: 10px;
  bottom: 10px;
}
</style>
