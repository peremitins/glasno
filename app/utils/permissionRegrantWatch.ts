// Наблюдение за «повторной выдачей» разрешения, пока открыта модалка с
// инструкцией. Пользователь уходит в настройки браузера/ОС, включает доступ и
// возвращается — модалка должна закрыться сама, а не съедать оверлеем первые
// клики по кнопкам. Два сигнала:
//  - PermissionStatus 'change' (Chromium шлёт его сразу при смене настройки);
//  - visibilitychange → повторный запрос состояния (возврат из настроек ОС).

export type WatchedPermissionName = 'microphone' | 'camera';

export interface PermissionRegrantWatchHandle {
  stop(): void;
}

interface PermissionStatusLike {
  state?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

interface NavigatorLike {
  permissions?: {
    query?: (descriptor: { name: PermissionName }) => Promise<unknown>;
  };
}

interface DocumentLike {
  visibilityState?: string;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

export function startPermissionRegrantWatch(input: {
  permissionName: WatchedPermissionName;
  onRegrant: () => void;
  navigatorRef?: NavigatorLike;
  documentRef?: DocumentLike;
}): PermissionRegrantWatchHandle {
  const navigatorRef =
    input.navigatorRef ??
    (typeof navigator !== 'undefined' ? (navigator as NavigatorLike) : undefined);
  const documentRef =
    input.documentRef ??
    (typeof document !== 'undefined' ? (document as DocumentLike) : undefined);

  let stopped = false;
  let status: PermissionStatusLike | null = null;

  const notifyIfGranted = (state: unknown) => {
    if (stopped || state !== 'granted') return;
    stopped = true;
    cleanup();
    input.onRegrant();
  };

  const queryState = async (): Promise<void> => {
    const permissions = navigatorRef?.permissions;
    const query = permissions?.query;
    if (!permissions || !query) return;
    try {
      const nextStatus = (await query.call(permissions, {
        name: input.permissionName as PermissionName,
      })) as PermissionStatusLike;
      if (stopped) return;
      // Подписываемся на изменения один раз — Chromium присылает 'change'
      // сразу после переключения настройки сайта, без возврата на вкладку.
      const subscribe = nextStatus?.addEventListener;
      if (!status && subscribe) {
        status = nextStatus;
        subscribe.call(nextStatus, 'change', handleStatusChange);
      }
      notifyIfGranted(nextStatus?.state);
    } catch {
      // Permissions API может не поддерживать camera/microphone (старые браузеры).
    }
  };

  function handleStatusChange() {
    notifyIfGranted(status?.state);
  }

  function handleVisibilityChange() {
    if (documentRef?.visibilityState === 'hidden') return;
    void queryState();
  }

  function cleanup() {
    documentRef?.removeEventListener('visibilitychange', handleVisibilityChange);
    if (status?.removeEventListener) {
      status.removeEventListener('change', handleStatusChange);
    }
    status = null;
  }

  documentRef?.addEventListener('visibilitychange', handleVisibilityChange);
  void queryState();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      cleanup();
    },
  };
}
