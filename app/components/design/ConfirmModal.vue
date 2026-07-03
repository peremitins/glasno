<script setup lang="ts">
  // Кастомная модалка подтверждения в стиле glass-фреймов проекта —
  // замена системному window.confirm (паттерн AlertDialog из Mentala).
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';

  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    confirmLabel: string;
    cancelLabel: string;
    pending?: boolean;
    // danger — для необратимых действий (отвязка карты).
    tone?: 'default' | 'danger';
  }>();

  const emit = defineEmits<{
    (e: 'update:open', value: boolean): void;
    (e: 'confirm'): void;
  }>();

  function close() {
    emit('update:open', false);
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div
        v-if="open"
        class="confirm-overlay"
        role="alertdialog"
        aria-modal="true"
        :aria-label="title"
        @click.self="close"
        @keydown.esc="close"
      >
        <div class="confirm glass-frame">
          <h2>{{ title }}</h2>
          <p v-if="description" class="confirm-description">
            {{ description }}
          </p>
          <div class="confirm-actions">
            <button
              type="button"
              class="secondary-action secondary-action--compact"
              :disabled="pending"
              @click="close"
            >
              {{ cancelLabel }}
            </button>
            <button
              type="button"
              class="primary-action primary-action--compact button-loader-host"
              :class="{ 'confirm-danger': tone === 'danger' }"
              :disabled="pending"
              @click="emit('confirm')"
            >
              <ButtonLoader v-if="pending" />
              <span
                class="button-loader-content"
                :class="{ 'button-loader-content--loading': pending }"
              >
                {{ confirmLabel }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 220;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: color-mix(in srgb, #000 62%, transparent);
    backdrop-filter: blur(4px);
  }

  .confirm {
    width: min(400px, 100%);
    display: grid;
    gap: 12px;
    padding: clamp(20px, 3vw, 26px);
  }

  .confirm h2 {
    margin: 0;
    font-size: 18px;
    color: var(--text-primary);
  }

  .confirm-description {
    margin: 0;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.5;
  }

  .confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .confirm-danger {
    background: color-mix(in srgb, var(--danger, #f87171) 24%, transparent);
    border-color: color-mix(in srgb, var(--danger, #f87171) 45%, transparent);
  }

  .confirm-fade-enter-active,
  .confirm-fade-leave-active {
    transition: opacity 0.18s ease;
  }

  .confirm-fade-enter-from,
  .confirm-fade-leave-to {
    opacity: 0;
  }
</style>
