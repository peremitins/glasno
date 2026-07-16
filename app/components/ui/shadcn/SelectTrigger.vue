<script setup lang="ts">
import { ChevronDownIcon } from '@radix-icons/vue';
import { reactiveOmit } from '@vueuse/core';
import { SelectIcon, SelectTrigger, useForwardProps } from 'reka-ui';
import type { SelectTriggerProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { cn } from '@/app/lib/utils';

const props = withDefaults(
  defineProps<
    SelectTriggerProps & {
      class?: HTMLAttributes['class'];
      size?: 'sm' | 'default';
    }
  >(),
  { class: undefined, size: 'default' }
);

const delegatedProps = reactiveOmit(props, 'class', 'size');
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <SelectTrigger
    data-slot="select-trigger"
    :data-size="size"
    v-bind="forwardedProps"
    :class="cn(
      'flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--surface-soft)] px-3.5 py-2 text-sm text-[var(--text-primary)] outline-none transition-[border-color,background-color,box-shadow] focus-visible:border-[var(--glass-border-strong)] focus-visible:bg-[var(--surface-raised)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent-2)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:min-h-11 data-[size=sm]:min-h-9 *:data-[slot=select-value]:line-clamp-1 [&_svg]:pointer-events-none [&_svg]:shrink-0',
      props.class
    )"
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDownIcon class="size-4 text-[var(--text-muted)]" />
    </SelectIcon>
  </SelectTrigger>
</template>
