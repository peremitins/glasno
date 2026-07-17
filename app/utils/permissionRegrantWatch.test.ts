import { describe, expect, it, vi } from 'vitest';
import { startPermissionRegrantWatch } from './permissionRegrantWatch';

type Listener = () => void;

function createFakeStatus(initialState: string) {
  const listeners = new Set<Listener>();
  return {
    state: initialState,
    addEventListener(_type: string, listener: Listener) {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: Listener) {
      listeners.delete(listener);
    },
    setState(next: string) {
      this.state = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function createFakeDocument(visibilityState = 'visible') {
  const listeners = new Set<Listener>();
  return {
    visibilityState,
    addEventListener(_type: string, listener: Listener) {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: Listener) {
      listeners.delete(listener);
    },
    emitVisibilityChange() {
      for (const listener of [...listeners]) listener();
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('startPermissionRegrantWatch', () => {
  it('fires onRegrant when PermissionStatus reports change to granted', async () => {
    const status = createFakeStatus('denied');
    const documentRef = createFakeDocument();
    const onRegrant = vi.fn();

    startPermissionRegrantWatch({
      permissionName: 'microphone',
      onRegrant,
      navigatorRef: {
        permissions: { query: async () => status },
      },
      documentRef,
    });
    await flushMicrotasks();
    expect(onRegrant).not.toHaveBeenCalled();

    status.setState('granted');
    expect(onRegrant).toHaveBeenCalledTimes(1);
    // После срабатывания слушатели снимаются.
    expect(status.listenerCount()).toBe(0);
    expect(documentRef.listenerCount()).toBe(0);
  });

  it('re-queries permission state when the page becomes visible again', async () => {
    let state = 'denied';
    const documentRef = createFakeDocument();
    const onRegrant = vi.fn();

    startPermissionRegrantWatch({
      permissionName: 'camera',
      onRegrant,
      navigatorRef: {
        permissions: { query: async () => ({ state }) },
      },
      documentRef,
    });
    await flushMicrotasks();
    expect(onRegrant).not.toHaveBeenCalled();

    // Пользователь вернулся из настроек, разрешение уже выдано.
    state = 'granted';
    documentRef.emitVisibilityChange();
    await flushMicrotasks();
    expect(onRegrant).toHaveBeenCalledTimes(1);
  });

  it('does nothing after stop() and survives missing Permissions API', async () => {
    const documentRef = createFakeDocument();
    const onRegrant = vi.fn();

    const handle = startPermissionRegrantWatch({
      permissionName: 'microphone',
      onRegrant,
      navigatorRef: {},
      documentRef,
    });
    await flushMicrotasks();
    handle.stop();
    expect(documentRef.listenerCount()).toBe(0);

    documentRef.emitVisibilityChange();
    await flushMicrotasks();
    expect(onRegrant).not.toHaveBeenCalled();
  });

  it('fires immediately when the permission is already granted', async () => {
    const documentRef = createFakeDocument();
    const onRegrant = vi.fn();

    startPermissionRegrantWatch({
      permissionName: 'microphone',
      onRegrant,
      navigatorRef: {
        permissions: { query: async () => ({ state: 'granted' }) },
      },
      documentRef,
    });
    await flushMicrotasks();
    expect(onRegrant).toHaveBeenCalledTimes(1);
  });
});
