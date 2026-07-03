import { computed, ref } from 'vue';

export type CameraPermissionState = 'granted' | 'denied' | 'prompt' | null;

const showCameraDeniedModal = ref(false);
const WEB_CAMERA_DENIED_STORAGE_KEY = 'glasno.camera.web.denied';

function normalizePermissionState(value: unknown): CameraPermissionState {
  return value === 'granted' || value === 'denied' || value === 'prompt'
    ? value
    : null;
}

function buildErrorSignature(error: unknown): string {
  const name = String((error as any)?.name || '');
  const message = String((error as any)?.message || '');
  return `${name} ${message}`.toLowerCase();
}

export function isCameraPermissionDeniedError(error: unknown): boolean {
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
      window.localStorage.setItem(WEB_CAMERA_DENIED_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(WEB_CAMERA_DENIED_STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable in private contexts.
  }
}

function hasWebDeniedFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(WEB_CAMERA_DENIED_STORAGE_KEY) === '1';
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

async function queryBrowserCameraPermission(): Promise<CameraPermissionState> {
  if (typeof navigator === 'undefined') return null;
  if (!navigator.permissions?.query) {
    return null;
  }

  try {
    const status = await navigator.permissions.query({
      name: 'camera' as PermissionName,
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

export function shouldBlockCameraCaptureBeforeRequest(input: {
  permissionState: CameraPermissionState;
  userAgent?: string;
}): boolean {
  if (input.permissionState !== 'denied') return false;
  return !isSafariPermissionPreflightUnreliable(input.userAgent);
}

export function shouldShowCameraDeniedFallbackAfterFailure(input: {
  priorPermissionState?: CameraPermissionState;
  currentPermissionState: CameraPermissionState;
  hadDeniedFlag: boolean;
}): boolean {
  // handleStartFailure calls this only after getUserMedia failed with a
  // permission-denied error. Safari may still report "prompt" afterwards, so
  // any non-granted state must show recovery instructions.
  return input.currentPermissionState !== 'granted';
}

export function useCameraPermissionGate() {
  const dialogMode = computed(() => 'browser' as const);

  function setCameraDeniedModalOpen(value: boolean) {
    showCameraDeniedModal.value = value;
  }

  async function getPermissionState() {
    return await queryBrowserCameraPermission();
  }

  async function ensureCanStartCapture() {
    const state = await getPermissionState();
    if (
      shouldBlockCameraCaptureBeforeRequest({
        permissionState: state,
      })
    ) {
      showCameraDeniedModal.value = true;
      return false;
    }
    return true;
  }

  async function handleStartFailure(
    error: unknown,
    options?: { priorPermissionState?: CameraPermissionState }
  ) {
    if (!isCameraPermissionDeniedError(error)) return false;
    const hadDeniedFlag = hasWebDeniedFlag();
    const currentState = await queryBrowserCameraPermission();
    if (currentState === 'granted') {
      setWebDeniedFlag(false);
      return false;
    }

    setWebDeniedFlag(true);
    if (
      shouldShowCameraDeniedFallbackAfterFailure({
        priorPermissionState: options?.priorPermissionState,
        currentPermissionState: currentState,
        hadDeniedFlag,
      })
    ) {
      showCameraDeniedModal.value = true;
      return true;
    }
    return false;
  }

  return {
    showCameraDeniedModal,
    dialogMode,
    setCameraDeniedModalOpen,
    getPermissionState,
    ensureCanStartCapture,
    handleStartFailure,
  };
}
