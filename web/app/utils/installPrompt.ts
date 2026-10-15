/**
 * Общая часть установки PWA: режим «уже установлено», платформа и хранение
 * отложенного события установки.
 *
 * Событие `beforeinstallprompt` браузер присылает один раз за загрузку страницы,
 * и вызвать `prompt()` можно только на нём же. Поэтому держим его в модульной
 * переменной, а не в состоянии компонента: ловит событие плагин на старте
 * приложения, а использует — страница настроек, куда человек попадает позже
 * (за это время событие успело бы потеряться).
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'other';

let deferred: BeforeInstallPromptEvent | null = null;

export const keepInstallEvent = (event: BeforeInstallPromptEvent): void => {
  deferred = event;
};

/** Забрать событие можно один раз: повторный `prompt()` браузер отвергает. */
export const takeInstallEvent = (): BeforeInstallPromptEvent | null => {
  const event = deferred;
  deferred = null;
  return event;
};

/**
 * Приложение открыто как установленное: в отдельном окне (`display-mode`),
 * а на iOS — в режиме standalone, который виден только через `navigator.standalone`.
 */
export const isInstalledDisplay = (): boolean => {
  if (!import.meta.client) {
    return false;
  }

  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return standalone || iosStandalone;
};

/**
 * Платформа нужна, чтобы предложить выполнимый путь: на iOS браузер установку
 * не предлагает вовсе, там помогает только «Поделиться → На экран „Домой“».
 */
export const detectInstallPlatform = (): InstallPlatform => {
  if (!import.meta.client) {
    return 'other';
  }

  const ua = navigator.userAgent;
  // iPad на iPadOS представляется как Mac — отличаем его по числу точек касания.
  const isIpad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  if (/iPhone|iPad|iPod/i.test(ua) || isIpad) {
    return 'ios';
  }

  if (/Android/i.test(ua)) {
    return 'android';
  }

  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) {
    return 'desktop';
  }

  return 'other';
};
