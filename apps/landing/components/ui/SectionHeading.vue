<script setup lang="ts">
  defineProps<{
    eyebrow?: string;
    title: string;
    lead?: string;
    tag?: string;
    align?: 'left' | 'center';
  }>();
</script>

<template>
  <div class="sh" :class="`sh--${align ?? 'left'}`">
    <p v-if="eyebrow" class="sh__eyebrow" data-reveal>
      <span class="sh__dot" aria-hidden="true" />
      {{ eyebrow }}
    </p>
    <RevealHeading :text="title" :tag="tag ?? 'h2'" class="sh__title" />
    <p v-if="lead" class="sh__lead" data-reveal>{{ lead }}</p>
  </div>
</template>

<style scoped>
  .sh {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 40ch;
  }
  .sh--center {
    align-items: center;
    text-align: center;
    max-width: 46ch;
    margin-inline: auto;
  }

  .sh__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
    letter-spacing: 0.01em;
  }

  .sh__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--l-warm);
    box-shadow: 0 0 0 4px oklch(0.77 0.155 58 / 0.16);
  }

  .sh__title {
    font-size: var(--l-fs-h2);
    font-weight: 600;
    color: var(--l-text);
  }

  .sh__lead {
    font-size: var(--l-fs-lead);
    line-height: 1.6;
    color: var(--l-text-soft);
    max-width: 54ch;
  }
  .sh--center .sh__lead {
    margin-inline: auto;
  }
</style>
