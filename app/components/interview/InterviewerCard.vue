<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { InterviewerAvatarId, InterviewerMode } from '@/shared/dto';

const props = defineProps<{
  avatarId: InterviewerAvatarId;
  mode: InterviewerMode;
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
</script>

<template>
  <div class="interviewer" :data-avatar="avatarId">
    <div class="portrait" :class="{ 'portrait--speaking': isSpeaking }">
      <span>{{ profile.initials }}</span>
      <i aria-hidden="true"></i>
    </div>
    <div class="meta">
      <p>{{ t('interview.session.stage.interviewer') }}</p>
      <h2>{{ profile.name }}</h2>
      <span>{{ isSpeaking ? t('interview.session.stage.speaking') : t('interview.session.stage.muted') }}</span>
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
  background:
    radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.22), transparent 28%),
    linear-gradient(135deg, #182033, #2f3b4f);
  color: #fff;
}

.interviewer[data-avatar='strict-lead'] {
  background:
    radial-gradient(circle at 50% 18%, rgba(255, 255, 255, 0.18), transparent 28%),
    linear-gradient(135deg, #15181d, #4a5568);
}

.interviewer[data-avatar='warm-hr'] {
  background:
    radial-gradient(circle at 50% 18%, rgba(255, 255, 255, 0.22), transparent 28%),
    linear-gradient(135deg, #25455a, #4f756b);
}

.portrait {
  position: relative;
  width: clamp(96px, 38%, 190px);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.08)),
    rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
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

.meta {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 18px;
  display: grid;
  gap: 4px;
  min-width: 0;
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
</style>
