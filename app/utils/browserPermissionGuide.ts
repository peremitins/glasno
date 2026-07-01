export type PermissionSubject = 'microphone' | 'camera' | 'sound';
export type PermissionBrowser =
  | 'chrome'
  | 'edge'
  | 'firefox'
  | 'safari'
  | 'yandex'
  | 'generic';
export type PermissionDevice = 'desktop' | 'ios' | 'android';

export interface BrowserPermissionEnvironment {
  browser: PermissionBrowser;
  device: PermissionDevice;
}

export interface BrowserPermissionGuide {
  eyebrow: string;
  title: string;
  copy: string;
  steps: string[];
  note: string;
}

const SUBJECT_LABELS: Record<
  PermissionSubject,
  {
    title: string;
    accusative: string;
    dative: string;
    setting: string;
  }
> = {
  microphone: {
    title: 'Нет доступа к микрофону',
    accusative: 'микрофон',
    dative: 'микрофону',
    setting: 'Микрофон',
  },
  camera: {
    title: 'Нет доступа к камере',
    accusative: 'камеру',
    dative: 'камере',
    setting: 'Камера',
  },
  sound: {
    title: 'Звук не воспроизводится',
    accusative: 'звук',
    dative: 'звуку',
    setting: 'Звук',
  },
};

const SAFARI_WEBSITE_SETTINGS: Record<PermissionSubject, string> = {
  microphone: 'Microphone',
  camera: 'Camera',
  sound: 'Auto-Play',
};

export function detectBrowserPermissionEnvironment(
  input?: Partial<{
    userAgent: string;
    platform: string;
    maxTouchPoints: number;
  }>
): BrowserPermissionEnvironment {
  const userAgent =
    input?.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const platform =
    input?.platform ??
    (typeof navigator !== 'undefined' ? navigator.platform : '');
  const maxTouchPoints =
    input?.maxTouchPoints ??
    (typeof navigator !== 'undefined'
      ? (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ??
        0
      : 0);

  const isIos =
    /iP(hone|ad|od)/.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);
  const device: PermissionDevice = isIos
    ? 'ios'
    : isAndroid
      ? 'android'
      : 'desktop';

  if (/YaBrowser/i.test(userAgent)) return { browser: 'yandex', device };
  if (/Edg\//i.test(userAgent) || /EdgiOS/i.test(userAgent)) {
    return { browser: 'edge', device };
  }
  if (/Firefox\//i.test(userAgent) || /FxiOS/i.test(userAgent)) {
    return { browser: 'firefox', device };
  }
  if (/Chrome\//i.test(userAgent) || /CriOS/i.test(userAgent)) {
    return { browser: 'chrome', device };
  }
  if (/Safari\//i.test(userAgent)) return { browser: 'safari', device };

  return { browser: 'generic', device };
}

export function buildBrowserPermissionGuide(
  subject: PermissionSubject,
  env = detectBrowserPermissionEnvironment()
): BrowserPermissionGuide {
  const labels = SUBJECT_LABELS[subject];
  return {
    eyebrow:
      subject === 'sound' ? 'Настройки воспроизведения' : 'Разрешение браузера',
    title: labels.title,
    copy: buildCopy(subject, labels),
    steps: buildSteps(subject, env, labels),
    note: buildNote(subject, env, labels),
  };
}

function buildCopy(
  subject: PermissionSubject,
  labels: (typeof SUBJECT_LABELS)[PermissionSubject]
): string {
  if (subject === 'sound') {
    return 'Браузер или настройки сайта не дают воспроизвести аудио. Включите звук для текущего сайта и повторите действие.';
  }

  return `Браузер не дал странице доступ к ${labels.dative}. Разрешите ${labels.accusative} в настройках сайта, затем повторите действие.`;
}

function buildSteps(
  subject: PermissionSubject,
  env: BrowserPermissionEnvironment,
  labels: (typeof SUBJECT_LABELS)[PermissionSubject]
): string[] {
  if (env.browser === 'safari' && env.device === 'ios') {
    return [
      'Нажмите кнопку настроек сайта в адресной строке Safari.',
      'Откройте «Настройки веб-сайта».',
      subject === 'sound'
        ? 'Проверьте громкость устройства и режим без звука, затем повторите воспроизведение.'
        : `Для пункта «${labels.setting}» выберите «Разрешить» или «Спросить».`,
      'Обновите страницу и попробуйте снова.',
    ];
  }

  if (env.browser === 'safari') {
    if (subject === 'sound') {
      return [
        'Откройте меню Safari → «Settings…» / «Настройки…».',
        'Перейдите во вкладку «Websites» / «Веб-сайты».',
        'Слева выберите «Auto-Play» и найдите текущий сайт или localhost.',
        'Выберите «Allow All Auto-Play» / «Разрешить автовоспроизведение» и обновите страницу.',
      ];
    }

    return [
      'Откройте меню Safari → «Settings…» / «Настройки…».',
      'Перейдите во вкладку «Websites» / «Веб-сайты».',
      `Слева выберите «${SAFARI_WEBSITE_SETTINGS[subject]}» / «${labels.setting}».`,
      'В списке сайтов найдите текущий сайт или localhost и выберите «Allow» / «Разрешить» или «Ask» / «Спросить».',
      'Обновите страницу и повторите действие.',
    ];
  }

  if (env.browser === 'firefox') {
    return [
      'Нажмите на значок замка слева от адреса сайта.',
      'Откройте «Permissions» или удалите сохранённый запрет рядом с нужным пунктом.',
      subject === 'sound'
        ? 'Для аудио проверьте разрешение Autoplay и разрешите воспроизведение звука.'
        : `Для пункта «${labels.setting}» уберите блокировку или выберите «Allow».`,
      'Обновите страницу и попробуйте снова.',
    ];
  }

  if (
    env.browser === 'chrome' ||
    env.browser === 'edge' ||
    env.browser === 'yandex'
  ) {
    return [
      'Нажмите на иконку слева от адреса сайта.',
      'Откройте «Site settings» / «Настройки сайтов» или раздел разрешений.',
      `Для пункта «${labels.setting}» выберите «Разрешить» или «Спросить».`,
      'Обновите страницу и повторите действие.',
    ];
  }

  return [
    'Нажмите на иконку безопасности или настроек рядом с адресом сайта.',
    'Откройте разрешения текущего сайта.',
    `Для пункта «${labels.setting}» выберите «Разрешить» или «Спросить».`,
    'Обновите страницу и повторите действие.',
  ];
}

function buildNote(
  subject: PermissionSubject,
  env: BrowserPermissionEnvironment,
  labels: (typeof SUBJECT_LABELS)[PermissionSubject]
): string {
  if (subject === 'sound') {
    return 'Для звука системный запрос обычно не появляется: браузер просто блокирует воспроизведение и требует изменить настройку сайта вручную.';
  }

  if (env.device === 'ios') {
    return `Если пункта «${labels.setting}» нет в настройках сайта, проверьте доступ браузера к ${labels.dative} в системных настройках устройства.`;
  }

  return 'Если системное окно больше не появляется, значит браузер уже запомнил выбор. После изменения разрешения обновите страницу.';
}
