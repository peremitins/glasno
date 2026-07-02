<script setup lang="ts">
  import { computed } from 'vue';
  import {
    buildBrowserPermissionGuide,
    type PermissionSubject,
  } from '@/app/utils/browserPermissionGuide';

  const props = defineProps<{
    open: boolean;
    subject: PermissionSubject;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
  }>();

  const guide = computed(() => buildBrowserPermissionGuide(props.subject));

  function close() {
    emit('update:open', false);
  }
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.open"
      class="permission-overlay"
      role="presentation"
      @click.self="close"
    >
      <section
        class="permission-dialog glass-frame"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-title"
      >
        <header class="permission-head">
          <div>
            <p>{{ guide.eyebrow }}</p>
            <h2 id="permission-title">{{ guide.title }}</h2>
          </div>
          <button
            class="permission-close"
            type="button"
            aria-label="Закрыть"
            @click="close"
          >
            ×
          </button>
        </header>

        <p class="permission-copy">{{ guide.copy }}</p>

        <ol class="permission-steps">
          <li v-for="(step, index) in guide.steps" :key="step">
            <span class="step-index">{{ index + 1 }}</span>
            <span>{{ step }}</span>
          </li>
        </ol>

        <!-- <p class="permission-note">{{ guide.note }}</p> -->

        <footer class="permission-actions">
          <button type="button" @click="close">Понятно</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
  .permission-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 18px;
    background: color-mix(in srgb, var(--app-bg) 72%, transparent);
    backdrop-filter: blur(4px);
  }

  .permission-dialog {
    width: min(460px, 100%);
    color: var(--text-primary);
    padding: 20px;
  }

  .permission-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 12px;
  }

  .permission-head p,
  .permission-head h2,
  .permission-copy,
  .permission-note {
    margin: 0;
  }

  .permission-head p {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .permission-head h2 {
    margin-top: 4px;
    color: var(--text-primary);
    font-size: 21px;
    line-height: 1.2;
  }

  .permission-close {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-xs);
    background: var(--surface-soft);
    color: var(--text-secondary);
    cursor: pointer;
    font: inherit;
    font-size: 22px;
    line-height: 1;
  }

  .permission-close:hover {
    border-color: var(--glass-border-strong);
    color: var(--text-primary);
  }

  .permission-copy {
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.45;
  }

  .permission-steps {
    display: grid;
    gap: 8px;
    margin: 16px 0 0;
    padding: 0;
    list-style: none;
  }

  .permission-steps li {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    background: var(--surface-soft);
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.4;
    padding: 10px;
  }

  .step-index {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent-2);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 900;
  }

  .permission-note {
    margin-top: 12px;
    border-left: 3px solid color-mix(in srgb, var(--accent) 36%, transparent);
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.45;
    padding-left: 10px;
  }

  .permission-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 18px;
  }

  .permission-actions button {
    min-height: 40px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--button-bg);
    color: var(--button-text);
    box-shadow: var(--button-shadow);
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    padding: 0 16px;
  }

  .permission-actions button:hover {
    background: var(--button-bg-hover);
  }
</style>
