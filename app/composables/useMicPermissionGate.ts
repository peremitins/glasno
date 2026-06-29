import { computed, ref } from 'vue';

export type MicPermissionState = 'granted' | 'denied' | 'prompt' | null;

const showMicDeniedModal = ref(false);
const WEB_MIC_DENIED_STORAGE_KEY = 'jobai.mic.web.denied';

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

function isWebPermissionDeniedError(error: unknown): boolean {
  const signature = buildErrorSignature(error);
  return (
    signature.includes('notallowederror') ||
    signature.includes('permission denied') ||
    signature.includes('permission dismissed') ||
    signature.includes('service-not-allowed')
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

async function queryBrowserMicrophonePermission(): Promise<MicPermissionState> {
  if (typeof navigator === 'undefined') return null;
  if (!navigator.permissions?.query) {
    return hasWebDeniedFlag() ? 'denied' : null;
  }

  try {
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    const state = normalizePermissionState(status.state);
    if (state === 'granted') setWebDeniedFlag(false);
    if (state === 'denied') setWebDeniedFlag(true);
    return state;
  } catch {
    return hasWebDeniedFlag() ? 'denied' : null;
  }
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
    if (state === 'denied') {
      showMicDeniedModal.value = true;
      return false;
    }
    return true;
  }

  async function handleStartFailure(
    error: unknown,
    options?: { priorPermissionState?: MicPermissionState }
  ) {
    if (!isWebPermissionDeniedError(error)) return false;
    const hadDeniedFlag = hasWebDeniedFlag();
    const currentState = await queryBrowserMicrophonePermission();
    if (currentState === 'granted') {
      setWebDeniedFlag(false);
      return false;
    }

    setWebDeniedFlag(true);
    if (
      options?.priorPermissionState === 'denied' ||
      hadDeniedFlag ||
      currentState === null
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
