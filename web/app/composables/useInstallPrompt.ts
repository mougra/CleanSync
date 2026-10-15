/**
 * Установка приложения на телефон и десктоп.
 *
 * Состояние (`available`) заполняет плагин `install-prompt.client`, который
 * ловит `beforeinstallprompt` от самого старта приложения: к моменту открытия
 * настроек событие уже ждёт своей очереди в `utils/installPrompt.ts`.
 *
 * Строка настроек ведёт себя по платформе, потому что установка выглядит
 * по-разному:
 * - Android и десктоп Chromium — событие есть, показываем кнопку;
 * - iOS — браузер установку не предлагает, показываем шаги «Поделиться →
 *   На экран „Домой“»; push там работает только в установленном приложении;
 * - всё остальное — строку не показываем, чтобы не вести в тупик.
 */
export const useInstallPrompt = () => {
  const { t } = useI18n();

  const state = useState<{ available: boolean; installed: boolean }>('pwa-install', () => ({
    available: false,
    installed: false,
  }));

  const platform = ref<InstallPlatform>('other');
  const dismissed = ref(false);
  /**
   * Строку показываем только после монтирования.
   *
   * И «платформа», и режим «уже установлено» известны только в браузере, а
   * событие установки плагин ловит ещё до гидрации. Если бы разметка зависела
   * от них сразу, сервер отрисовал бы страницу без строки, клиент — со строкой,
   * и Vue сообщил бы о расхождении гидрации.
   */
  const mounted = ref(false);

  onMounted(() => {
    platform.value = detectInstallPlatform();
    // Режим отображения уточняем на клиенте: на сервере его нет.
    state.value.installed = isInstalledDisplay();
    mounted.value = true;
  });

  const isInstalled = computed(() => state.value.installed);
  const canInstall = computed(() => state.value.available && !state.value.installed);

  const visible = computed(
    () =>
      mounted.value &&
      (isInstalled.value ||
        canInstall.value ||
        platform.value === 'ios' ||
        platform.value === 'android'),
  );

  /** Подпись строки: короткое объяснение того, что даёт установка. */
  const subtitle = computed(() => (isInstalled.value ? '' : t('settings.installHint')));

  const install = async (): Promise<void> => {
    dismissed.value = false;

    const event = takeInstallEvent();

    if (!event) {
      // Событие потрачено или устарело: инструкцию человек и так видит в строке.
      state.value.available = false;
      return;
    }

    await event.prompt();
    const { outcome } = await event.userChoice;

    state.value.available = false;
    dismissed.value = outcome === 'dismissed';
  };

  return { visible, canInstall, isInstalled, platform, dismissed, subtitle, install };
};
