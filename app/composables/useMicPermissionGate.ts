import { computed, ref, watch } from 'vue';
import {
  startPermissionRegrantWatch,
  type PermissionRegrantWatchHandle,
} from '@/app/utils/permissionRegrantWatch';

export type MicPermissionState = 'granted' | 'denied' | 'prompt' | null;

const showMicDeniedModal = ref(false);
const WEB_MIC_DENIED_STORAGE_KEY = 'glasno.mic.web.denied';

// Пока открыта модалка с инструкцией, следим за состоянием разрешения: как
// только пользователь включил микрофон в настройках и вернулся — закрываем
// модалку сами, чтобы её оверлей не съедал первый клик по кнопке голоса.
let micRegrantWatch: PermissionRegrantWatchHandle | null = null;
watch(showMicDeniedModal, (open) => {
  if (typeof window === 'undefined') return;
  micRegrantWatch?.stop();
  micRegrantWatch = null;
  if (!open) return;
  micRegrantWatch = startPermissionRegrantWatch({
    permissionName: 'microphone',
    onRegrant: () => {
      setWebDeniedFlag(false);
      showMicDeniedModal.value = false;
    },
  });
});

function normalizePermissionState(value: unknown): MicPermissionState {
  return value === 'granted' || value === 'denied' || value === 'prompt'
    ? value
    : null;
}

function buildErrorSignature(error: unknown): string {
  const name = String((error as any)?.name || '');
  const message = String((error as any)?.message || '');
  return `${name} ${message}`.toLowerCase();
}

export function isWebMicrophonePermissionDeniedError(error: unknown): boolean {
  const signature = buildErrorSignature(error);
  return (
    signature.includes('notallowederror') ||
    signature.includes('not allowed') ||
    signature.includes('permission denied') ||
    signature.includes('permission dismissed') ||
    signature.includes('service-not-allowed') ||
    signature.includes('user denied')
  );
}

function setWebDeniedFlag(value: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (value) {
      window.localStorage.setItem(WEB_MIC_DENIED_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(WEB_MIC_DENIED_STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable in private contexts.
  }
}

function hasWebDeniedFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(WEB_MIC_DENIED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function isSafariPermissionPreflightUnreliable(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): boolean {
  return (
    /Safari\//i.test(userAgent) &&
    !/(Chrome|CriOS|Chromium|Edg|EdgiOS|Firefox|FxiOS|YaBrowser)\//i.test(
      userAgent
    )
  );
}

async function queryBrowserMicrophonePermission(): Promise<MicPermissionState> {
  if (typeof navigator === 'undefined') return null;
  if (!navigator.permissions?.query) {
    return null;
  }

  try {
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    const state = normalizePermissionState(status.state);
    if (state === 'granted') setWebDeniedFlag(false);
    if (state === 'prompt') setWebDeniedFlag(false);
    if (state === 'denied') setWebDeniedFlag(true);
    return state;
  } catch {
    return null;
  }
}

export function shouldBlockMicCaptureBeforeRequest(input: {
  permissionState: MicPermissionState;
  userAgent?: string;
}): boolean {
  if (input.permissionState !== 'denied') return false;
  return !isSafariPermissionPreflightUnreliable(input.userAgent);
}

export function shouldShowMicDeniedFallbackAfterFailure(input: {
  priorPermissionState?: MicPermissionState;
  currentPermissionState: MicPermissionState;
  hadDeniedFlag: boolean;
}): boolean {
  // handleStartFailure calls this only after getUserMedia failed with a
  // permission-denied error. Safari may still report "prompt" afterwards, so
  // any non-granted state must show recovery instructions.
  return input.currentPermissionState !== 'granted';
}

export function useMicPermissionGate() {
  const dialogMode = computed(() => 'browser' as const);

  function setMicDeniedModalOpen(value: boolean) {
    showMicDeniedModal.value = value;
  }

  async function getPermissionState() {
    return await queryBrowserMicrophonePermission();
  }

  async function ensureCanStartCapture() {
    const state = await getPermissionState();
    if (
      shouldBlockMicCaptureBeforeRequest({
        permissionState: state,
      })
    ) {
      showMicDeniedModal.value = true;
      return false;
    }
    return true;
  }

  async function handleStartFailure(
    error: unknown,
    options?: { priorPermissionState?: MicPermissionState }
  ) {
    if (!isWebMicrophonePermissionDeniedError(error)) return false;
    const hadDeniedFlag = hasWebDeniedFlag();
    const currentState = await queryBrowserMicrophonePermission();
    if (currentState === 'granted') {
      setWebDeniedFlag(false);
      return false;
    }

    setWebDeniedFlag(true);
    if (
      shouldShowMicDeniedFallbackAfterFailure({
        priorPermissionState: options?.priorPermissionState,
        currentPermissionState: currentState,
        hadDeniedFlag,
      })
    ) {
      showMicDeniedModal.value = true;
      return true;
    }
    return false;
  }

  return {
    showMicDeniedModal,
    dialogMode,
    setMicDeniedModalOpen,
    getPermissionState,
    ensureCanStartCapture,
    handleStartFailure,
  };
}
