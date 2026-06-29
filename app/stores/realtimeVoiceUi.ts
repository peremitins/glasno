import { defineStore } from 'pinia';

export type RealtimeVoiceStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'stopping'
  | 'error';

export const useRealtimeVoiceUiStore = defineStore('realtimeVoiceUi', {
  state: () => ({
    status: 'idle' as RealtimeVoiceStatus,
    errorMessage: '',
  }),
  actions: {
    setStatus(status: RealtimeVoiceStatus) {
      this.status = status;
      if (status !== 'error') {
        this.errorMessage = '';
      }
    },
    setError(message: string) {
      this.status = 'error';
      this.errorMessage = message;
    },
    reset() {
      this.status = 'idle';
      this.errorMessage = '';
    },
  },
});
