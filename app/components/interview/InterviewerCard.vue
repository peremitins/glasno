<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type {
    InterviewerAvatarId,
    InterviewerFaceId,
    InterviewerMode,
  } from '@/shared/dto';
  import { getInterviewerFacePhotoSrc } from '@/app/utils/interviewerAssets';

  const props = defineProps<{
    avatarId: InterviewerAvatarId;
    mode: InterviewerMode;
    faceId?: InterviewerFaceId;
    isSpeaking?: boolean;
  }>();

  const { t } = useI18n();

  const profile = computed(() => {
    const map = {
      'neutral-pro': {
        name: t('interview.new.avatar.neutralPro.name'),
        description: t('interview.new.avatar.neutralPro.description'),
        initials: 'NP',
      },
      'strict-lead': {
        name: t('interview.new.avatar.strictLead.name'),
        description: t('interview.new.avatar.strictLead.description'),
        initials: 'SL',
      },
      'warm-hr': {
        name: t('interview.new.avatar.warmHr.name'),
        description: t('interview.new.avatar.warmHr.description'),
        initials: 'HR',
      },
    } satisfies Record<
      InterviewerAvatarId,
      { name: string; description: string; initials: string }
    >;
    return map[props.avatarId];
  });

  // Фото интервьюера лежит в public/interviewers/<faceId>.webp и отдаётся по
  // корневому пути «/interviewers/<faceId>.webp». Если файла нет или он не
  // загрузился — показываем инициалы-заглушку.
  const photoFailed = ref(false);
  const photoSrc = computed(() => {
    if (!props.faceId) return '';
    return getInterviewerFacePhotoSrc(props.faceId);
  });
  const showPhoto = computed(
    () => Boolean(photoSrc.value) && !photoFailed.value
  );

  // Если фото поменяли — снова пробуем загрузить.
  watch(photoSrc, () => {
    photoFailed.value = false;
  });
</script>

<template>
  <div
    class="interviewer"
    :class="{
      'interviewer--photo': showPhoto,
      'interviewer--speaking': isSpeaking,
    }"
    :data-avatar="avatarId"
  >
    <img
      v-if="showPhoto"
      class="interviewer-photo"
      :src="photoSrc"
      :alt="profile.name"
      @error="photoFailed = true"
    />
    <div v-if="showPhoto" class="photo-shade" aria-hidden="true"></div>

    <div
      v-if="!showPhoto"
      class="portrait"
      :class="{ 'portrait--speaking': isSpeaking }"
    >
      <span>{{ profile.initials }}</span>
      <i aria-hidden="true"></i>
    </div>

    <!-- Аудио-полоски: мягкий индикатор «интервьюер говорит». -->
    <div v-if="isSpeaking" class="audio-bars" aria-hidden="true">
      <span></span><span></span><span></span><span></span>
    </div>
    <div class="meta">
      <p>{{ t('interview.session.stage.interviewer') }}</p>
      <h2>{{ profile.name }}</h2>
      <span>{{
        isSpeaking
          ? t('interview.session.stage.speaking')
          : t('interview.session.stage.muted')
      }}</span>
    </div>
  </div>
</template>

<style scoped>
  .interviewer {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 8px;
    padding: clamp(14px, 3vw, 28px);
    background: radial-gradient(
        circle at 50% 20%,
        rgba(255, 255, 255, 0.22),
        transparent 28%
      ),
      linear-gradient(135deg, #182033, #2f3b4f);
    color: #fff;
  }

  .interviewer-photo,
  .photo-shade {
    position: absolute;
    inset: 0;
  }

  .interviewer-photo {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
  }

  .photo-shade {
    pointer-events: none;
    background: linear-gradient(
        180deg,
        rgba(8, 12, 22, 0.05) 35%,
        rgba(8, 12, 22, 0.72) 100%
      ),
      linear-gradient(
        90deg,
        rgba(8, 12, 22, 0.28),
        transparent 42%,
        rgba(8, 12, 22, 0.16)
      );
  }

  .interviewer--speaking {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.2),
      inset 0 0 42px rgba(120, 180, 255, 0.28);
  }

  .interviewer[data-avatar='strict-lead'] {
    background: radial-gradient(
        circle at 50% 18%,
        rgba(255, 255, 255, 0.18),
        transparent 28%
      ),
      linear-gradient(135deg, #15181d, #4a5568);
  }

  .interviewer[data-avatar='warm-hr'] {
    background: radial-gradient(
        circle at 50% 18%,
        rgba(255, 255, 255, 0.22),
        transparent 28%
      ),
      linear-gradient(135deg, #25455a, #4f756b);
  }

  .portrait {
    position: relative;
    width: clamp(96px, 38%, 190px);
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: linear-gradient(
        145deg,
        rgba(255, 255, 255, 0.34),
        rgba(255, 255, 255, 0.08)
      ),
      rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.28);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
    transition: box-shadow 0.25s ease, transform 0.25s ease;
  }

  /* Подсветка портрета, когда интервьюер говорит. */
  .portrait--speaking {
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.35),
      0 18px 60px rgba(0, 0, 0, 0.3), 0 0 38px rgba(120, 180, 255, 0.45);
  }

  .portrait span {
    font-size: clamp(24px, 7vw, 40px);
    font-weight: 900;
    letter-spacing: 0;
  }

  .portrait i {
    position: absolute;
    inset: -10px;
    border-radius: inherit;
    border: 2px solid rgba(255, 255, 255, 0.36);
    opacity: 0;
  }

  .portrait--speaking i {
    animation: pulse 1.15s ease-out infinite;
  }

  /* Маленькие вертикальные аудио-полоски снизу портрета. */
  .audio-bars {
    position: absolute;
    bottom: 18px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 18px;
    padding: 3px 7px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.32);
    z-index: 2;
  }

  .audio-bars span {
    width: 3px;
    height: 40%;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.9);
    animation: bars 0.9s ease-in-out infinite;
  }

  .audio-bars span:nth-child(2) {
    animation-delay: 0.15s;
  }
  .audio-bars span:nth-child(3) {
    animation-delay: 0.3s;
  }
  .audio-bars span:nth-child(4) {
    animation-delay: 0.45s;
  }

  .meta {
    position: absolute;
    left: 18px;
    right: 18px;
    bottom: 18px;
    display: grid;
    gap: 4px;
    min-width: 0;
    z-index: 2;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  }

  .meta p,
  .meta h2 {
    margin: 0;
  }

  .meta p,
  .meta span {
    color: rgba(255, 255, 255, 0.72);
    font-size: 13px;
    font-weight: 800;
  }

  .meta h2 {
    overflow-wrap: anywhere;
    font-size: clamp(17px, 2.6vw, 22px);
    line-height: 1.1;
  }

  @keyframes pulse {
    0% {
      transform: scale(0.98);
      opacity: 0.8;
    }
    100% {
      transform: scale(1.18);
      opacity: 0;
    }
  }

  @keyframes bars {
    0%,
    100% {
      height: 30%;
    }
    50% {
      height: 100%;
    }
  }

  /* Уважение к prefers-reduced-motion: оставляем только статичную подсветку,
   без постоянного движения пульса и полосок. */
  @media (prefers-reduced-motion: reduce) {
    .portrait--speaking i {
      animation: none;
      opacity: 0.5;
    }
    .audio-bars span {
      animation: none;
      height: 60%;
    }
    .portrait {
      transition: none;
    }
  }
</style>
