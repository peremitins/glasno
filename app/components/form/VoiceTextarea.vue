<script setup lang="ts">
  import { Cross2Icon } from '@radix-icons/vue';
  import { computed, nextTick, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
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

  const { t } = useI18n();

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

  const showClear = computed(
    () => !props.disabled && props.modelValue.length > 0
  );

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

  function clearValue() {
    if (props.disabled) return;
    value.value = '';
    nextTick(() => {
      resize();
      textareaRef.value?.focus();
    });
  }

  watch(
    () => props.modelValue,
    () => nextTick(resize)
  );

  onMounted(resize);
</script>

<template>
  <div
    class="voice-textarea"
    :class="{
      'voice-textarea--disabled': disabled,
      'voice-textarea--clearable': showClear,
    }"
  >
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
    <button
      v-if="showClear"
      class="voice-textarea__clear"
      type="button"
      :aria-label="t('voice.textarea.clear')"
      :title="t('voice.textarea.clear')"
      @click="clearValue"
    >
      <Cross2Icon aria-hidden="true" />
    </button>
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
    transition: background var(--motion-normal) var(--ease-out),
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

  .voice-textarea__clear {
    position: absolute;
    top: 10px;
    right: 10px;
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: var(--surface-raised);
    color: var(--text-muted);
    cursor: pointer;
    transition: transform var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out);
  }

  .voice-textarea__clear:hover {
    border-color: var(--focus-ring);
    background: var(--surface-soft);
    color: var(--text-primary);
  }

  .voice-textarea__clear:active {
    transform: translateY(1px) scale(0.98);
  }

  .voice-textarea__clear svg {
    width: 15px;
    height: 15px;
  }

  .voice-textarea__mic {
    position: absolute;
    right: 10px;
    bottom: 10px;
  }
</style>
