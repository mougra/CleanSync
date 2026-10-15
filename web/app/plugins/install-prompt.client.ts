import type { BeforeInstallPromptEvent } from '~/utils/installPrompt';

/**
 * Перехват предложения установить приложение.
 *
 * Chrome и Edge присылают `beforeinstallprompt` вскоре после загрузки — задолго
 * до того, как человек откроет настройки. Слушаем с самого старта и складываем
 * состояние в `useState` под ключом `pwa-install`: страница настроек читает его
 * через `useInstallPrompt`, поэтому кнопка «Установить» работает так же, как
 * если бы событие поймали в момент клика.
 *
 * Саму мини-плашку браузера гасим (`preventDefault`): установку предлагаем
 * в настройках, где рядом есть объяснение, зачем это нужно.
 */
export default defineNuxtPlugin(() => {
  const state = useState<{ available: boolean; installed: boolean }>('pwa-install', () => ({
    available: false,
    installed: false,
  }));

  // display-mode на сервере не существует — уточняем после гидрации.
  state.value.installed = isInstalledDisplay();

  window.addEventListener('beforeinstallprompt', (rawEvent) => {
    const event = rawEvent as BeforeInstallPromptEvent;

    event.preventDefault();
    keepInstallEvent(event);
    state.value.available = true;
  });

  window.addEventListener('appinstalled', () => {
    // Событие потрачено: вторая попытка установки не нужна.
    takeInstallEvent();
    state.value.available = false;
    state.value.installed = true;
  });
});
