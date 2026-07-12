<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    Cross2Icon,
    FileTextIcon,
    ReloadIcon,
    UploadIcon,
  } from '@radix-icons/vue';
  import type { ResumeExtractResponse } from '@/shared/dto';
  import { sanitizeProviderErrorMessage } from '@/app/utils/providerErrorMessage';

  defineProps<{
    id: string;
    label: string;
    placeholder?: string;
  }>();

  const emit = defineEmits<{
    'update:modelValue': [value: string];
  }>();

  const { t } = useI18n();
  const api = useAPI();

  const MAX_RESUME_CONTEXT_CHARS = 15_000;

  const notes = ref('');
  const fileName = ref('');
  const fileText = ref('');
  const isExtracting = ref(false);
  const errorMessage = ref('');

  const combined = computed(() => {
    const parts: string[] = [];
    const extracted = fileText.value.trim();
    if (extracted) {
      parts.push(
        `Резюме из файла${fileName.value ? ` "${fileName.value}"` : ''}:\n${extracted}`
      );
    }
    const trimmedNotes = notes.value.trim();
    if (trimmedNotes) parts.push(trimmedNotes);
    const merged = parts.join('\n\n');
    return merged.length > MAX_RESUME_CONTEXT_CHARS
      ? merged.slice(0, MAX_RESUME_CONTEXT_CHARS - 96).trimEnd()
      : merged;
  });

  watch(combined, (value) => emit('update:modelValue', value));

  async function onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    fileName.value = file.name;
    fileText.value = '';
    isExtracting.value = true;
    errorMessage.value = '';
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await api<ResumeExtractResponse>(
        '/api/interview/resume/extract',
        { method: 'POST', body }
      );
      fileText.value = response.text;
      fileName.value = response.fileName || file.name;
    } catch (err) {
      fileName.value = '';
      fileText.value = '';
      errorMessage.value = sanitizeProviderErrorMessage(
        err instanceof Error ? err.message : '',
        t('interview.common.unknownError')
      );
    } finally {
      isExtracting.value = false;
      input.value = '';
    }
  }

  function clearFile() {
    fileName.value = '';
    fileText.value = '';
    errorMessage.value = '';
  }
</script>

<template>
  <div class="field quick-resume">
    <div class="quick-resume__head">
      <label :for="id">{{ label }}</label>

      <div class="quick-resume__file">
        <template v-if="fileText || isExtracting">
          <span
            class="quick-resume__chip"
            :class="{ 'quick-resume__chip--loading': isExtracting }"
          >
            <ReloadIcon
              v-if="isExtracting"
              class="quick-resume__spin"
              aria-hidden="true"
            />
            <FileTextIcon v-else aria-hidden="true" />
            <span class="quick-resume__chip-text">
              {{
                isExtracting
                  ? t('dashboard.launcherResumeExtracting')
                  : t('dashboard.launcherResumeAttached', {
                      count: fileText.length,
                    })
              }}
            </span>
            <button
              v-if="!isExtracting"
              type="button"
              class="quick-resume__remove"
              :aria-label="t('dashboard.launcherResumeRemove')"
              :title="t('dashboard.launcherResumeRemove')"
              @click="clearFile"
            >
              <Cross2Icon aria-hidden="true" />
            </button>
          </span>
        </template>

        <label v-else class="quick-resume__attach" :for="`${id}-file`">
          <UploadIcon aria-hidden="true" />
          {{ t('dashboard.launcherResumeAttach') }}
        </label>
        <input
          :id="`${id}-file`"
          class="quick-resume__input"
          type="file"
          accept=".pdf,.txt,.md,.png,.jpg,.jpeg,text/plain,text/markdown,application/pdf,image/png,image/jpeg"
          :disabled="isExtracting"
          @change="onFileChange"
        >
      </div>
    </div>

    <textarea
      :id="id"
      v-model="notes"
      class="text-control"
      rows="3"
      :placeholder="placeholder"
    />

    <p v-if="errorMessage" class="quick-resume__error">{{ errorMessage }}</p>
    <p v-else class="field-hint">{{ t('dashboard.launcherResumeHint') }}</p>
  </div>
</template>

<style scoped>
  .field {
    display: grid;
    gap: 8px;
  }

  .quick-resume__head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  /* Лейбл «Резюме или опыт» держим в одну строку — прикреплённый файл его не
     вытесняет: сжимается сам чип (текст обрезается многоточием). */
  .quick-resume__head label {
    flex: 0 0 auto;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 900;
    white-space: nowrap;
  }

  .quick-resume__file {
    position: relative;
    display: inline-flex;
    flex: 0 1 auto;
    min-width: 0;
  }

  .quick-resume__input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .quick-resume__attach {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    border: 1px dashed var(--glass-border-strong);
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-soft));
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 850;
    padding: 0 12px;
    transition: border-color var(--motion-normal) var(--ease-out),
      background var(--motion-normal) var(--ease-out),
      color var(--motion-normal) var(--ease-out);
  }

  .quick-resume__input:focus-visible + .quick-resume__attach,
  .quick-resume__attach:hover {
    border-color: var(--focus-ring);
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .quick-resume__chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    min-width: 0;
    min-height: 32px;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--glass-border));
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-soft));
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 850;
    padding: 0 6px 0 12px;
  }

  .quick-resume__chip--loading {
    color: var(--text-secondary);
  }

  .quick-resume__chip svg {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    color: var(--accent-2);
  }

  .quick-resume__chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quick-resume__spin {
    animation: quick-resume-spin 0.9s linear infinite;
  }

  @keyframes quick-resume-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .quick-resume__remove {
    display: inline-grid;
    flex: 0 0 auto;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .quick-resume__remove:hover {
    background: var(--surface-raised);
    color: var(--text-primary);
  }

  .quick-resume__remove svg {
    width: 13px;
    height: 13px;
  }

  .text-control {
    width: 100%;
    min-height: 92px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-control);
    background: var(--surface-soft);
    color: var(--text-primary);
    outline: 0;
    padding: 14px 15px;
    resize: vertical;
    transition: background var(--motion-normal) var(--ease-out),
      border-color var(--motion-normal) var(--ease-out),
      box-shadow var(--motion-normal) var(--ease-out);
  }

  .text-control::placeholder {
    color: var(--text-muted);
  }

  .text-control:focus {
    border-color: var(--focus-ring);
    background: var(--surface-raised);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--focus-ring) 18%, transparent);
  }

  .field-hint {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.45;
  }

  .quick-resume__error {
    color: var(--danger);
    font-size: 13px;
    font-weight: 850;
  }

  @media (max-width: 520px) {
    .quick-resume__head {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
  }
</style>
