<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCameraPermissionGate } from '@/app/composables/useCameraPermissionGate';

// Камера полностью управляется родителем через prop `active`.
// Своей кнопки у компонента нет — единственный переключатель живёт
// в нижнем доке экрана собеседования (как в Zoom/Телемост).
const props = defineProps<{ active?: boolean }>();
const emit = defineEmits<{
  'active-change': [value: boolean];
  'start-failed': [];
}>();

const { t } = useI18n();
const cameraPermissionGate = useCameraPermissionGate();

const videoRef = ref<HTMLVideoElement | null>(null);
const stream = ref<MediaStream | null>(null);
const errorMessage = ref('');
const isStarting = ref(false);

const isActive = computed(() => Boolean(stream.value));

async function startCamera() {
  if (!import.meta.client || isActive.value || isStarting.value) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    errorMessage.value = t('camera.unsupported');
    emit('active-change', false);
    emit('start-failed');
    return;
  }
  const priorPermissionState = await cameraPermissionGate.getPermissionState();
  if (!(await cameraPermissionGate.ensureCanStartCapture())) {
    errorMessage.value = t('camera.blocked');
    emit('active-change', false);
    emit('start-failed');
    return;
  }

  isStarting.value = true;
  errorMessage.value = '';
  try {
    const nextStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 960 },
        height: { ideal: 540 },
      },
      audio: false,
    });
    if (!props.active) {
      nextStream.getTracks().forEach((track) => track.stop());
      return;
    }
    stream.value = nextStream;
    emit('active-change', true);
    if (videoRef.value) {
      videoRef.value.srcObject = nextStream;
      await videoRef.value.play();
    }
  } catch (error) {
    await cameraPermissionGate.handleStartFailure(error, {
      priorPermissionState,
    });
    errorMessage.value = t('camera.blocked');
    emit('active-change', false);
    emit('start-failed');
  } finally {
    isStarting.value = false;
  }
}

function stopCamera() {
  stream.value?.getTracks().forEach((track) => track.stop());
  stream.value = null;
  emit('active-change', false);
  if (videoRef.value) {
    videoRef.value.srcObject = null;
  }
}

// Запуск/остановка потока следуют за prop `active`.
watch(
  () => props.active,
  (active) => {
    if (active) void startCamera();
    else stopCamera();
  }
);

onMounted(() => {
  if (props.active) void startCamera();
});

onBeforeUnmount(stopCamera);
</script>

<template>
  <div class="camera" :class="{ 'camera--active': isActive }">
    <video
      ref="videoRef"
      class="video"
      autoplay
      playsinline
      muted
      aria-label="local camera"
    />
    <div v-if="!isActive" class="placeholder">
      <span class="avatar" aria-hidden="true">
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="camAvatarBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#3a475f" />
              <stop offset="1" stop-color="#232c3d" />
            </linearGradient>
            <linearGradient id="camAvatarFg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="rgba(255,255,255,0.92)" />
              <stop offset="1" stop-color="rgba(255,255,255,0.62)" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="60" fill="url(#camAvatarBg)" />
          <circle cx="60" cy="46" r="20" fill="url(#camAvatarFg)" />
          <path
            d="M22 104c4-21 19-32 38-32s34 11 38 32a60 60 0 0 1-76 0Z"
            fill="url(#camAvatarFg)"
          />
        </svg>
      </span>
      <span class="placeholder-text">{{ errorMessage || t('camera.idle') }}</span>
    </div>
  </div>
</template>

<style scoped>
.camera {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--surface-solid);
}

.video,
.placeholder {
  position: absolute;
  inset: 0;
}

.video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  /* Зеркалим себя, как делают все видеозвонки. */
  transform: scaleX(-1);
  opacity: 0;
}

.camera--active .video {
  opacity: 1;
}

.placeholder {
  display: grid;
  place-items: center;
  gap: 14px;
  align-content: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  text-align: center;
  padding: 14px;
  background:
    radial-gradient(120% 90% at 50% 12%, rgba(255, 255, 255, 0.06), transparent 60%),
    linear-gradient(160deg, #202838, #161c28);
}

/* Аватар-заглушка вместо камеры: «фото пользователя» в виде силуэта. */
.avatar {
  display: grid;
  place-items: center;
  width: clamp(72px, 22%, 116px);
  aspect-ratio: 1;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(150deg, #3a475f, #232c3d);
  box-shadow:
    0 18px 44px rgba(0, 0, 0, 0.42),
    inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.avatar svg {
  width: 100%;
  height: 100%;
}

.placeholder-text {
  max-width: 220px;
  color: rgba(255, 255, 255, 0.66);
  font-weight: 600;
}
</style>
