<script setup lang="ts">
  import {
    CheckIcon,
    EyeNoneIcon,
    GearIcon,
    ReloadIcon,
  } from '@radix-icons/vue';
  import {
    DropdownMenuContent,
    DropdownMenuItemIndicator,
    DropdownMenuPortal,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuRoot,
    DropdownMenuTrigger,
  } from 'reka-ui';
  import type { QuestionPreferenceStatus } from '@/shared/dto';

  defineProps<{
    modelValue: QuestionPreferenceStatus | null;
    loading?: boolean;
    compact?: boolean;
  }>();
  const emit = defineEmits<{
    select: [status: QuestionPreferenceStatus];
  }>();

  const options: Array<{
    value: QuestionPreferenceStatus;
    label: string;
    description: string;
    icon: typeof ReloadIcon;
  }> = [
    {
      value: 'repeat',
      label: 'Повторять',
      description: 'Добавлять в следующие похожие интервью',
      icon: ReloadIcon,
    },
    {
      value: 'mastered',
      label: 'Освоено',
      description: 'Убрать из обязательного повторения',
      icon: CheckIcon,
    },
    {
      value: 'hidden',
      label: 'Не показывать',
      description: 'Исключить из похожих интервью',
      icon: EyeNoneIcon,
    },
  ];

  function selectStatus(value: unknown) {
    if (value === 'repeat' || value === 'mastered' || value === 'hidden') {
      emit('select', value);
    }
  }
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="question-preference-trigger"
        :class="{
          'question-preference-trigger--active': modelValue,
          'question-preference-trigger--compact': compact,
        }"
        :disabled="loading"
        :aria-label="loading ? 'Сохраняем настройку вопроса' : 'Настроить вопрос'"
      >
        <GearIcon aria-hidden="true" />
        <span v-if="!compact">Настроить</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="question-preference-menu"
        :side-offset="8"
        align="end"
      >
        <DropdownMenuRadioGroup
          :model-value="modelValue || ''"
          @update:model-value="selectStatus"
        >
          <DropdownMenuRadioItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="question-preference-option"
          >
            <component :is="option.icon" class="question-preference-option__icon" />
            <span class="question-preference-option__copy">
              <strong>{{ option.label }}</strong>
              <small>{{ option.description }}</small>
            </span>
            <DropdownMenuItemIndicator class="question-preference-option__check">
              <CheckIcon />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style>
  .question-preference-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 42px;
    padding: 0 12px;
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    background: var(--surface-raised);
    color: var(--text-secondary);
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .question-preference-trigger svg {
    width: 17px;
    height: 17px;
  }
  .question-preference-trigger--compact {
    width: 42px;
    padding: 0;
  }
  .question-preference-trigger--active {
    border-color: color-mix(in srgb, var(--accent) 52%, var(--glass-border));
    color: var(--text-primary);
  }
  .question-preference-trigger:hover:not(:disabled),
  .question-preference-trigger:focus-visible {
    border-color: var(--glass-border-strong);
    color: var(--text-primary);
  }
  .question-preference-trigger:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 65%, transparent);
    outline-offset: 2px;
  }
  .question-preference-trigger:disabled {
    cursor: wait;
    opacity: 0.6;
  }
  .question-preference-menu {
    z-index: 120;
    width: min(330px, calc(100vw - 24px));
    padding: 6px;
    border: 1px solid var(--glass-border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    color: var(--text-primary);
    box-shadow: var(--shadow-panel);
    backdrop-filter: blur(18px);
  }
  .question-preference-option {
    position: relative;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 10px;
    outline: none;
    cursor: pointer;
    user-select: none;
  }
  .question-preference-option[data-highlighted] {
    background: var(--surface-soft);
  }
  .question-preference-option__icon,
  .question-preference-option__check svg {
    width: 17px;
    height: 17px;
    color: var(--text-secondary);
  }
  .question-preference-option__copy {
    display: grid;
    gap: 2px;
  }
  .question-preference-option__copy strong {
    font-size: 13px;
  }
  .question-preference-option__copy small {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.35;
  }
  .question-preference-option__check {
    display: inline-grid;
    place-items: center;
    color: var(--accent);
  }
</style>
