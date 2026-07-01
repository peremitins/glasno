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
        class="permission-dialog"
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
    background: rgba(6, 9, 18, 0.62);
    backdrop-filter: blur(4px);
  }

  .permission-dialog {
    width: min(460px, 100%);
    border: 1px solid rgba(155, 166, 206, 0.3);
    border-radius: 18px;
    background: #f8faff;
    color: #242942;
    box-shadow: 0 24px 80px rgba(20, 26, 48, 0.26),
      inset 0 1px 0 rgba(255, 255, 255, 0.82);
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
    color: #747d96;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .permission-head h2 {
    margin-top: 4px;
    font-size: 21px;
    line-height: 1.2;
  }

  .permission-close {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid rgba(105, 116, 148, 0.22);
    border-radius: 10px;
    background: #fff;
    color: #4d566e;
    cursor: pointer;
    font: inherit;
    font-size: 22px;
    line-height: 1;
  }

  .permission-close:hover {
    border-color: rgba(79, 88, 112, 0.28);
    color: #252b3c;
  }

  .permission-copy {
    color: #4f5870;
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
    border: 1px solid rgba(116, 125, 150, 0.18);
    border-radius: 12px;
    background: #fff;
    color: #333b52;
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
    background: rgba(101, 87, 255, 0.1);
    color: #6557ff;
    font-size: 12px;
    font-weight: 900;
  }

  .permission-note {
    margin-top: 12px;
    border-left: 3px solid rgba(101, 87, 255, 0.36);
    color: #606980;
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
    border-radius: 11px;
    background: #6557ff;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    padding: 0 16px;
  }

  .permission-actions button:hover {
    background: #584beb;
  }
</style>
