<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue';
  import { SpeakerLoudIcon, SpeakerOffIcon } from '@radix-icons/vue';

  const props = withDefaults(
    defineProps<{
      /** Путь к видео (mp4/webm). Пока пусто — показываем постер-заглушку. */
      src?: string;
      poster?: string;
      caption?: string;
      soundHint?: string;
      /** Показывать кнопку управления звуком. */
      showSoundControl?: boolean;
      /** CSS aspect-ratio, напр. '16 / 10' */
      aspect?: string;
      /** Скрыть плашку «Запись скоро появится» (для плотных постеров) */
      hideSoon?: boolean;
    }>(),
    {
      src: '',
      poster: '',
      caption: '',
      soundHint: 'Включите звук',
      showSoundControl: true,
      aspect: '16 / 10',
      hideSoon: false,
    }
  );

  const stageEl = ref<HTMLElement | null>(null);
  const videoEl = ref<HTMLVideoElement | null>(null);
  const started = ref(false);
  const muted = ref(true);

  const hasVideo = Boolean(props.src);
  let observer: IntersectionObserver | null = null;

  async function playWhenVisible() {
    const video = videoEl.value;
    if (!video) return;

    try {
      await video.play();
      started.value = true;
    } catch {
      // Автозапуск может быть запрещён браузером, хотя видео замьючено.
      // В этом случае оставляем статичный кадр без лишних элементов управления.
    }
  }

  function pauseWhenHidden() {
    videoEl.value?.pause();
    started.value = false;
  }

  function toggleSound() {
    const el = videoEl.value;
    muted.value = !muted.value;
    if (el) el.muted = muted.value;
  }

  onMounted(() => {
    if (!hasVideo || !stageEl.value || typeof IntersectionObserver === 'undefined') {
      return;
    }

    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void playWhenVisible();
        } else {
          pauseWhenHidden();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(stageEl.value);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    pauseWhenHidden();
  });
</script>

<template>
  <figure class="vp">
    <div
      ref="stageEl"
      class="vp__stage"
      :class="{ 'vp__stage--live': started }"
      :style="{ aspectRatio: aspect }"
    >
      <!-- Реальное видео (когда задан src) -->
      <video
        v-if="hasVideo"
        ref="videoEl"
        class="vp__video"
        :poster="poster || undefined"
        :muted="muted"
        loop
        playsinline
        preload="none"
      >
        <source :src="src">
      </video>

      <!-- Постер-заглушка: стилизованный кадр интерфейса из слота -->
      <div v-show="!started" class="vp__poster">
        <slot name="poster" />

        <span v-if="!hasVideo && !hideSoon" class="vp__soon">
          Запись интервью скоро появится
        </span>
      </div>

      <!-- Контролы поверх играющего видео -->
      <div v-if="hasVideo && started && showSoundControl" class="vp__controls">
        <button
          class="vp__ctrl vp__ctrl--sound"
          type="button"
          :aria-pressed="!muted"
          :aria-label="muted ? 'Включить звук' : 'Выключить звук'"
          :title="muted ? soundHint : 'Выключить звук'"
          @click="toggleSound"
        >
          <SpeakerOffIcon v-if="muted" aria-hidden="true" />
          <SpeakerLoudIcon v-else aria-hidden="true" />
        </button>
      </div>
    </div>

    <figcaption v-if="caption" class="vp__caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
  .vp {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .vp__stage {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: var(--l-r-xl);
    border: 1px solid var(--l-line);
    background: var(--l-bg-elevated);
    box-shadow: var(--l-shadow);
  }

  .vp__video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .vp__poster {
    position: absolute;
    inset: 0;
  }

  .vp__poster > :first-child {
    position: absolute;
    inset: 0;
  }

  .vp__soon {
    position: absolute;
    left: 50%;
    top: calc(50% + 56px);
    transform: translateX(-50%);
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
    background: oklch(0.145 0.01 260 / 0.7);
    padding: 6px 14px;
    border-radius: var(--l-r-pill);
    border: 1px solid var(--l-line);
    backdrop-filter: blur(6px);
    white-space: nowrap;
  }

  .vp__controls {
    position: absolute;
    right: clamp(12px, 2vw, 20px);
    bottom: clamp(12px, 2vw, 20px);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .vp__ctrl {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--l-line-hi);
    background: oklch(0.145 0.01 260 / 0.72);
    color: var(--l-text);
    backdrop-filter: blur(10px);
    transition: border-color var(--l-dur-1) var(--l-ease);
  }

  .vp__ctrl:hover {
    border-color: var(--l-line-warm);
  }

  .vp__ctrl svg {
    width: 18px;
    height: 18px;
  }

  .vp__ctrl--sound[aria-pressed='true'] {
    border-color: var(--l-line-warm);
    color: var(--l-warm);
  }

  .vp__caption {
    font-size: var(--l-fs-sm);
    color: var(--l-text-mut);
    padding-left: 4px;
  }
</style>
