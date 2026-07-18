import { ref } from 'vue';

// Встроенный виджет оплаты YooKassa (confirmation.type = embedded).
// Пользователь платит картой/СБП/SberPay, не покидая Гласно: виджет сам
// рисует форму, QR для СБП и список банков, а по успеху редиректит на
// return_url — дальше отрабатывает обычный флоу сверки статуса на /pricing.
const WIDGET_SRC = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js';

// YooKassa принимает цвета только в HEX. Подбираем их по активной теме
// приложения, не вмешиваясь в DOM и геометрию стороннего iframe.
function getYooKassaWidgetColors() {
  const isLightTheme = document.documentElement.dataset.theme === 'light';

  if (isLightTheme) {
    return {
      background: '#F4F7FF',
      text: '#15182A',
      border: '#C7D0EA',
      control_secondary: '#7883A6',
      control_primary: '#7C5CFF',
      control_primary_content: '#FFFFFF',
    };
  }

  return {
    background: '#11162C',
    text: '#F7F8FF',
    border: '#394466',
    control_secondary: '#AAB4D3',
    control_primary: '#7C5CFF',
    control_primary_content: '#FFFFFF',
  };
}

interface YooKassaWidgetInstance {
  render: (containerId?: string) => Promise<void>;
  on: (event: 'modal_close', callback: () => void) => void;
  destroy: () => void;
}

interface YooKassaWidgetConstructor {
  new (options: {
    confirmation_token: string;
    return_url: string;
    customization?: Record<string, unknown>;
    error_callback?: (error: unknown) => void;
  }): YooKassaWidgetInstance;
}

declare global {
  interface Window {
    YooMoneyCheckoutWidget?: YooKassaWidgetConstructor;
  }
}

// Скрипт грузим один раз на страницу и переиспользуем промис при повторных
// открытиях чекаута.
let scriptPromise: Promise<YooKassaWidgetConstructor> | null = null;

// Без таймаута зависший CDN YooKassa держит mount() в подвешенном состоянии
// минуты (браузерный сетевой таймаут) — пользователь видит пустой экран.
const SCRIPT_LOAD_TIMEOUT_MS = 10_000;

function loadWidgetScript(): Promise<YooKassaWidgetConstructor> {
  if (window.YooMoneyCheckoutWidget) {
    return Promise.resolve(window.YooMoneyCheckoutWidget);
  }
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<YooKassaWidgetConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Сбрасываем промис и убираем тег, чтобы «Повторить» вставил свежий
    // <script>, а не ждал уже зависший.
    const fail = (message: string) => {
      if (timeoutId) clearTimeout(timeoutId);
      scriptPromise = null;
      script.remove();
      reject(new Error(message));
    };

    script.src = WIDGET_SRC;
    script.async = true;
    script.onload = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (window.YooMoneyCheckoutWidget) {
        resolve(window.YooMoneyCheckoutWidget);
      } else {
        fail('YooMoneyCheckoutWidget недоступен после загрузки');
      }
    };
    script.onerror = () => {
      fail('Не удалось загрузить виджет YooKassa');
    };
    timeoutId = setTimeout(() => {
      fail('Виджет YooKassa не загрузился за отведённое время');
    }, SCRIPT_LOAD_TIMEOUT_MS);
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export type YookassaWidgetState = 'idle' | 'loading' | 'open' | 'failed';

export function useYookassaWidget() {
  // Конечный автомат вместо пары loading/failed: модалки-потребители
  // показывают собственный оверлей (лоадер/ошибку/выбор тарифа), пока
  // state !== 'open', и прячут его, только когда окно YooKassa реально
  // открыто. Так UI и body scroll-lock не могут разъехаться с фактом
  // видимости оплаты.
  const state = ref<YookassaWidgetState>('idle');
  let instance: YooKassaWidgetInstance | null = null;

  async function mount(params: {
    confirmationToken: string;
    returnUrl: string;
    container?: HTMLElement;
    modal?: boolean;
    onModalClose?: () => void;
    onError?: () => void;
  }): Promise<void> {
    destroy();
    state.value = 'loading';
    try {
      const Widget = await loadWidgetScript();
      instance = new Widget({
        confirmation_token: params.confirmationToken,
        return_url: params.returnUrl,
        customization: {
          ...(params.modal ? { modal: true } : {}),
          colors: getYooKassaWidgetColors(),
        },
        error_callback: () => {
          // Убираем полуживую модалку YooKassa, чтобы под нашим оверлеем
          // с ошибкой не осталось её остатков.
          destroy();
          state.value = 'failed';
          params.onError?.();
        },
      });
      if (params.modal) {
        instance.on('modal_close', () => {
          destroy();
          params.onModalClose?.();
        });
        await instance.render();
        // error_callback мог уничтожить инстанс, пока render() ждал —
        // тогда состояние уже 'failed' и перетирать его нельзя.
        if (instance) state.value = 'open';
        return;
      }
      // render() принимает строковый id контейнера (не HTMLElement) —
      // гарантируем id на элементе и передаём именно его.
      if (!params.container) {
        throw new Error('Не задан контейнер для встроенного виджета YooKassa');
      }
      if (!params.container.id) {
        params.container.id = `yookassa-widget-${Math.random()
          .toString(36)
          .slice(2)}`;
      }
      await instance.render(params.container.id);
      if (instance) state.value = 'open';
    } catch {
      state.value = 'failed';
      params.onError?.();
    }
  }

  function destroy(): void {
    if (instance) {
      instance.destroy();
      instance = null;
    }
    state.value = 'idle';
  }

  return { state, mount, destroy };
}
