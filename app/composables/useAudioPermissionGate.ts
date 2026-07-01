import { ref } from 'vue';

const showAudioBlockedModal = ref(false);

function buildAudioErrorSignature(error: unknown): string {
  const name = String((error as any)?.name || '');
  const message = String((error as any)?.message || '');
  return `${name} ${message}`.toLowerCase();
}

export function isAudioPlaybackBlockedError(error: unknown): boolean {
  const signature = buildAudioErrorSignature(error);
  if (signature.includes('notsupportederror')) return false;

  return (
    signature.includes('notallowederror') ||
    signature.includes('securityerror') ||
    signature.includes('autoplay') ||
    signature.includes('play() failed') ||
    signature.includes('user did not interact') ||
    signature.includes('user didn') ||
    signature.includes('permission denied') ||
    signature.includes('blocked audio') ||
    signature.includes('audio playback was blocked')
  );
}

export function useAudioPermissionGate() {
  function setAudioBlockedModalOpen(value: boolean) {
    showAudioBlockedModal.value = value;
  }

  function handlePlaybackFailure(error: unknown): boolean {
    if (!isAudioPlaybackBlockedError(error)) return false;
    showAudioBlockedModal.value = true;
    return true;
  }

  return {
    showAudioBlockedModal,
    setAudioBlockedModalOpen,
    handlePlaybackFailure,
  };
}
