<script setup lang="ts">
  import { ref } from 'vue';
  import {
    PauseIcon,
    PlayIcon,
    SpeakerLoudIcon,
    SpeakerOffIcon,
  } from '@radix-icons/vue';

  const props = withDefaults(
    defineProps<{
      /** Путь к видео (mp4/webm). Пока пусто — показываем постер-заглушку. */
      src?: string;
      poster?: string;
      caption?: string;
      soundHint?: string;
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
      aspect: '16 / 10',
      hideSoon: false,
    }
  );

  const videoEl = ref<HTMLVideoElement | null>(null);
  const started = ref(false);
  const playing = ref(false);
  const muted = ref(true);

  const hasVideo = Boolean(props.src);

  async function start() {
    if (!hasVideo || !videoEl.value) return;
    started.value = true;
    try {
      await videoEl.value.play();
      playing.value = true;
    } catch {
      playing.value = false;
    }
  }

  function togglePlay() {
    const el = videoEl.value;
    if (!el) return;
    if (el.paused) {
      void el.play();
      playing.value = true;
    } else {
      el.pause();
      playing.value = false;
    }
  }

  function toggleSound() {
    const el = videoEl.value;
    muted.value = !muted.value;
    if (el) el.muted = muted.value;
  }
</script>

<template>
  <figure class="vp">
    <div
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
        @click="togglePlay"
      >
        <source :src="src">
      </video>

      <!-- Постер-заглушка: стилизованный кадр интерфейса из слота -->
      <div v-show="!started" class="vp__poster">
        <slot name="poster" />

        <button
          class="vp__play"
          type="button"
          :aria-label="hasVideo ? 'Воспроизвести' : 'Запись скоро появится'"
          @click="start"
        >
          <PlayIcon aria-hidden="true" />
        </button>

        <span v-if="!hasVideo && !hideSoon" class="vp__soon">
          Запись интервью скоро появится
        </span>
      </div>

      <!-- Контролы поверх играющего видео -->
      <div v-if="hasVideo && started" class="vp__controls">
        <button
          class="vp__ctrl"
          type="button"
          :aria-label="playing ? 'Пауза' : 'Играть'"
          @click="togglePlay"
        >
          <PauseIcon v-if="playing" aria-hidden="true" />
          <PlayIcon v-else aria-hidden="true" />
        </button>
        <button
          class="vp__ctrl vp__ctrl--sound"
          type="button"
          :aria-pressed="!muted"
          :aria-label="muted ? 'Включить звук' : 'Выключить звук'"
          @click="toggleSound"
        >
          <SpeakerOffIcon v-if="muted" aria-hidden="true" />
          <SpeakerLoudIcon v-else aria-hidden="true" />
          <span>{{ muted ? soundHint : 'Звук включён' }}</span>
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
    cursor: pointer;
  }

  .vp__poster {
    position: absolute;
    inset: 0;
  }

  .vp__poster > :first-child {
    position: absolute;
    inset: 0;
  }

  .vp__play {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: grid;
    place-items: center;
    width: clamp(56px, 7vw, 76px);
    aspect-ratio: 1;
    border-radius: var(--l-r-pill);
    border: 1px solid var(--l-line-warm);
    background: var(--l-warm-solid);
    color: var(--l-warm-ink);
    box-shadow: var(--l-shadow-warm);
    transition:
      transform var(--l-dur-1) var(--l-ease),
      background var(--l-dur-1) var(--l-ease);
  }

  .vp__play svg {
    width: 42%;
    height: 42%;
    margin-left: 6%;
  }

  .vp__play:hover {
    transform: translate(-50%, -50%) scale(1.06);
    background: var(--l-warm);
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
    left: clamp(12px, 2vw, 20px);
    bottom: clamp(12px, 2vw, 20px);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .vp__ctrl {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 42px;
    padding-inline: 14px;
    border-radius: var(--l-r-pill);
    border: 1px solid var(--l-line-hi);
    background: oklch(0.145 0.01 260 / 0.72);
    color: var(--l-text);
    font-size: var(--l-fs-sm);
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
