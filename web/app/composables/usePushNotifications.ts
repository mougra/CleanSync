import type { PushStatus } from '~/types/push';

/** VAPID-ключ приходит в base64url — PushManager ждёт BufferSource. */
const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  // Явный ArrayBuffer: PushManager не принимает Uint8Array поверх SharedArrayBuffer.
  const output = new Uint8Array(new ArrayBuffer(raw.length));

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
};

/**
 * Напоминания через Web Push.
 *
 * Разрешение спрашиваем только по нажатию пользователя: браузеры блокируют
 * автоматический запрос, а отказ потом нельзя отозвать из кода.
 * Подписка хранится на сервере, поэтому напоминание придёт, даже если
 * приложение закрыто.
 */
export const usePushNotifications = () => {
  const api = useApi();
  const auth = useAuthStore();

  const supported = ref(false);
  const permission = ref<NotificationPermission>('default');
  const devices = ref(0);
  const busy = ref(false);

  const refresh = async () => {
    if (!import.meta.client) {
      return;
    }

    supported.value =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    permission.value = supported.value ? Notification.permission : 'denied';

    if (!auth.isAuthenticated || !supported.value) {
      devices.value = 0;
      return;
    }

    try {
      const status = await api.request<PushStatus>('/api/push/status');
      devices.value = status.devices;
    } catch {
      // Тихо: это второстепенная информация, ошибку показывать не нужно.
      devices.value = 0;
    }
  };

  const registration = async (): Promise<ServiceWorkerRegistration> => {
    // Worker регистрирует плагин pwa.client при загрузке приложения; здесь
    // только ждём готовности, а если его почему-то нет — регистрируем сами.
    const existing = await navigator.serviceWorker.getRegistration();

    if (!existing) {
      await navigator.serviceWorker.register(serviceWorkerUrl(), { scope: '/' });
    }

    return navigator.serviceWorker.ready;
  };

  const enable = async (): Promise<boolean> => {
    if (!supported.value) {
      return false;
    }

    busy.value = true;
    try {
      const granted = await Notification.requestPermission();
      permission.value = granted;

      if (granted !== 'granted') {
        return false;
      }

      const registration_ = await registration();
      const { publicKey } = await api.request<{ publicKey: string }>('/api/push/key');

      const existing = await registration_.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration_.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      await api.request('/api/push/subscribe', {
        method: 'POST',
        body: subscription.toJSON(),
      });

      await refresh();
      return true;
    } finally {
      busy.value = false;
    }
  };

  const disable = async () => {
    busy.value = true;
    try {
      const registration_ = await navigator.serviceWorker.ready;
      const subscription = await registration_.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;

      await subscription?.unsubscribe();
      await api.request('/api/push/unsubscribe', {
        method: 'POST',
        body: endpoint ? { endpoint } : {},
      });

      await refresh();
    } finally {
      busy.value = false;
    }
  };

  const sendTest = async (): Promise<number> => {
    const result = await api.request<{ delivered: number }>('/api/push/test', { method: 'POST' });
    return result.delivered;
  };

  return { supported, permission, devices, busy, refresh, enable, disable, sendTest };
};
