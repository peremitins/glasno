import { onScopeDispose, watch, type Ref } from 'vue';

// Блокировка прокрутки фона под открытой модалкой. Пока хоть одна модалка
// открыта, на <body> висит overflow: hidden — страница под попапом не
// скроллится (частая жалоба на мобильных). Счётчик позволяет держать
// несколько модалок одновременно и снимать блокировку только когда закрылась
// последняя. Ширину исчезнувшего скроллбара компенсируем padding-right, чтобы
// контент не «дёргался».

let lockCount = 0;
let previousOverflow = '';
let previousPaddingRight = '';

function applyLock() {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    const { body } = document;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    previousOverflow = body.style.overflow;
    previousPaddingRight = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  lockCount += 1;
}

function releaseLock() {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    const { body } = document;
    body.style.overflow = previousOverflow;
    body.style.paddingRight = previousPaddingRight;
  }
}

export function useBodyScrollLock(isOpen: Ref<boolean> | (() => boolean)) {
  const getter = typeof isOpen === 'function' ? isOpen : () => isOpen.value;
  let locked = false;

  const lock = () => {
    if (locked) return;
    locked = true;
    applyLock();
  };
  const unlock = () => {
    if (!locked) return;
    locked = false;
    releaseLock();
  };

  watch(getter, (open) => (open ? lock() : unlock()), { immediate: true });
  onScopeDispose(unlock);
}
