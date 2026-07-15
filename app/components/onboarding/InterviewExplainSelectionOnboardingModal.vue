<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue';
  import { Cross2Icon, MagicWandIcon } from '@radix-icons/vue';
  import ButtonLoader from '@/app/components/design/ButtonLoader.vue';

  const props = defineProps<{
    open: boolean;
    pending?: boolean;
    errorMessage?: string;
  }>();

  const emit = defineEmits<{
    (e: 'close' | 'complete'): void;
  }>();

  useBodyScrollLock(() => props.open);

  const dialog = ref<HTMLElement | null>(null);
  const videoError = ref(false);
  const videoSrc = '/onboarding/interview-explain-selection.mp4';
  const hasError = computed(() =>
    Boolean(props.errorMessage || videoError.value)
  );

  watch(
    () => props.open,
    async (open) => {
      if (!open) return;
      videoError.value = false;
      await nextTick();
      dialog.value?.focus();
    }
  );
</script>

<template>
  <Teleport to="body">
    <Transition name="interview-onboarding-fade">
      <div
        v-if="open"
        class="interview-onboarding"
        role="presentation"
        @click.self="emit('close')"
      >
        <section
          ref="dialog"
          class="interview-onboarding__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="interview-onboarding-title"
          tabindex="-1"
          @keydown.esc="emit('close')"
        >
          <button
            class="interview-onboarding__close"
            type="button"
            aria-label="Закрыть онбординг"
            :disabled="pending"
            @click="emit('close')"
          >
            <Cross2Icon aria-hidden="true" />
          </button>

          <div class="interview-onboarding__media">
            <video
              class="interview-onboarding__video"
              :src="videoSrc"
              autoplay
              muted
              playsinline
              loop
              preload="auto"
              aria-label="Как выделить текст в интервью и нажать «Объяснить»"
              @error="videoError = true"
            />
            <div class="interview-onboarding__media-caption">
              <MagicWandIcon aria-hidden="true" />
              <span>Выделите слово или фразу</span>
            </div>
          </div>

          <div class="interview-onboarding__content">
            <span class="interview-onboarding__kicker">
              Быстрая подсказка
            </span>
            <h2 id="interview-onboarding-title">
              Выделите текст и получите объяснение
            </h2>
            <p>
              Не поняли слово или формулировку в интервью? Выделите и сразу
              увидите короткое объяснение.
            </p>

            <p v-if="hasError" class="interview-onboarding__error">
              {{
                errorMessage ||
                'Видео не загрузилось, но функция уже доступна на этой странице.'
              }}
            </p>

            <div class="interview-onboarding__actions">
              <button
                class="interview-onboarding__secondary"
                type="button"
                :disabled="pending"
                @click="emit('close')"
              >
                Посмотрю позже
              </button>
              <button
                class="interview-onboarding__primary button-loader-host"
                type="button"
                :disabled="pending"
                @click="emit('complete')"
              >
                <ButtonLoader v-if="pending" />
                <span
                  class="button-loader-content"
                  :class="{ 'button-loader-content--loading': pending }"
                >
                  Понятно
                </span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .interview-onboarding {
    position: fixed;
    inset: 0;
    z-index: 320;
    display: grid;
    place-items: center;
    overflow: hidden;
    padding: clamp(12px, 2.2vw, 28px);
    background: radial-gradient(
        circle at 18% 8%,
        color-mix(in srgb, var(--accent-2) 20%, transparent),
        transparent 34%
      ),
      radial-gradient(
        circle at 86% 18%,
        color-mix(in srgb, var(--accent) 24%, transparent),
        transparent 38%
      ),
      rgb(var(--app-bg-rgb) / 0.72);
    backdrop-filter: blur(12px);
  }

  .interview-onboarding__panel {
    position: relative;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    gap: clamp(16px, 2.2vw, 28px);
    width: min(1120px, 100%);
    max-height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: clamp(14px, 1.8vw, 22px);
    border: 1px solid var(--glass-border-strong);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--surface-solid) 84%, transparent);
    box-shadow: var(--shadow-soft), inset 0 1px 0 var(--inner-highlight);
    outline: none;
  }

  .interview-onboarding__close {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface-raised) 76%, transparent);
    color: var(--text-secondary);
    cursor: pointer;
    backdrop-filter: blur(10px);
    transition: transform var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out);
  }

  .interview-onboarding__close:hover:not(:disabled),
  .interview-onboarding__close:focus-visible {
    border-color: var(--glass-border-strong);
    color: var(--text-primary);
    transform: translateY(-1px);
  }

  .interview-onboarding__close:disabled {
    cursor: default;
    opacity: 0.58;
  }

  .interview-onboarding__close svg {
    width: 17px;
    height: 17px;
  }

  .interview-onboarding__media {
    position: relative;
    aspect-ratio: 2076 / 1080;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    border-radius: calc(var(--radius-lg) - 6px);
    background: var(--surface-soft);
    box-shadow: inset 0 1px 0 var(--inner-highlight);
  }

  .interview-onboarding__video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--app-bg);
  }

  .interview-onboarding__media-caption {
    position: absolute;
    left: 14px;
    bottom: 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: calc(100% - 28px);
    padding: 9px 12px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface-solid) 76%, transparent);
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 800;
    backdrop-filter: blur(14px);
    box-shadow: inset 0 1px 0 var(--inner-highlight);
  }

  .interview-onboarding__media-caption svg {
    width: 15px;
    height: 15px;
    color: var(--accent-2);
  }

  .interview-onboarding__content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    padding: clamp(8px, 1.8vw, 18px) clamp(8px, 1.2vw, 14px)
      clamp(8px, 1.8vw, 18px) 0;
  }

  .interview-onboarding__kicker {
    align-self: flex-start;
    margin-bottom: 14px;
    padding: 7px 10px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    color: var(--accent-2);
    background: color-mix(in srgb, var(--accent-2) 10%, transparent);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .interview-onboarding__content h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: clamp(24px, 3vw, 42px);
    line-height: 1.05;
    letter-spacing: 0;
  }

  .interview-onboarding__content p {
    margin: 16px 0 0;
    color: var(--text-secondary);
    font-size: clamp(14px, 1.35vw, 16px);
    line-height: 1.55;
  }

  .interview-onboarding__error {
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--danger) 38%, transparent);
    border-radius: var(--radius-xs);
    color: var(--danger) !important;
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }

  .interview-onboarding__actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 28px;
  }

  .interview-onboarding__secondary,
  .interview-onboarding__primary {
    min-height: 46px;
    border-radius: 999px;
    padding: 0 18px;
    font: inherit;
    font-size: 14px;
    font-weight: 850;
    cursor: pointer;
    transition: transform var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      opacity var(--motion-fast) var(--ease-out);
  }

  .interview-onboarding__secondary {
    border: 1px solid var(--glass-border);
    background: var(--surface-soft);
    color: var(--text-secondary);
  }

  .interview-onboarding__primary {
    border: 0;
    background: var(--button-bg);
    color: var(--button-text);
    box-shadow: var(--button-shadow);
  }

  .interview-onboarding__secondary:hover:not(:disabled),
  .interview-onboarding__primary:hover:not(:disabled),
  .interview-onboarding__secondary:focus-visible,
  .interview-onboarding__primary:focus-visible {
    transform: translateY(-1px);
  }

  .interview-onboarding__secondary:hover:not(:disabled),
  .interview-onboarding__secondary:focus-visible {
    border-color: var(--glass-border-strong);
    color: var(--text-primary);
  }

  .interview-onboarding__secondary:active:not(:disabled),
  .interview-onboarding__primary:active:not(:disabled) {
    transform: translateY(1px);
  }

  .interview-onboarding__secondary:disabled,
  .interview-onboarding__primary:disabled {
    cursor: default;
    opacity: 0.64;
  }

  .interview-onboarding-fade-enter-active,
  .interview-onboarding-fade-leave-active {
    transition: opacity 260ms var(--ease-out);
  }

  .interview-onboarding-fade-enter-active .interview-onboarding__panel,
  .interview-onboarding-fade-leave-active .interview-onboarding__panel {
    transition: transform 320ms var(--ease-out), opacity 320ms var(--ease-out);
  }

  .interview-onboarding-fade-enter-from,
  .interview-onboarding-fade-leave-to {
    opacity: 0;
  }

  .interview-onboarding-fade-enter-from .interview-onboarding__panel,
  .interview-onboarding-fade-leave-to .interview-onboarding__panel {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }

  @media (max-width: 900px) {
    .interview-onboarding {
      place-items: center;
      padding: 10px;
    }

    .interview-onboarding__panel {
      grid-template-columns: 1fr;
      gap: 14px;
      max-height: calc(100dvh - 20px);
      overflow-y: auto;
      border-radius: var(--radius-md);
    }

    .interview-onboarding__video {
      min-height: auto;
      aspect-ratio: 16 / 10;
    }

    .interview-onboarding__content {
      padding: 0 2px 4px;
    }
  }

  @media (max-width: 540px) {
    .interview-onboarding__panel {
      padding: 10px;
    }

    .interview-onboarding__media {
      border-radius: var(--radius-sm);
    }

    .interview-onboarding__media-caption {
      left: 10px;
      bottom: 10px;
      padding: 7px 10px;
      font-size: 12px;
    }

    .interview-onboarding__content h2 {
      font-size: 24px;
    }

    .interview-onboarding__actions {
      display: grid;
      grid-template-columns: 1fr;
      margin-top: 20px;
    }

    .interview-onboarding__secondary,
    .interview-onboarding__primary {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .interview-onboarding-fade-enter-active,
    .interview-onboarding-fade-leave-active,
    .interview-onboarding-fade-enter-active .interview-onboarding__panel,
    .interview-onboarding-fade-leave-active .interview-onboarding__panel {
      transition: none;
    }
  }
</style>
