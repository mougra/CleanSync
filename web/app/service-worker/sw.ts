/// <reference lib="webworker" />
/**
 * Service worker приложения.
 *
 * Кэшируем только статику через precache (список подставляет сборка).
 * Ответы API и HTML-страницы не кэшируем: там персональные данные, и показать
 * устаревший план хуже, чем не показать ничего.
 *
 * Здесь же живут push-напоминания: сервер присылает заголовок, текст и ссылку.
 */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload;

  try {
    payload = (event.data?.json() ?? {}) as PushPayload;
  } catch {
    payload = { body: event.data?.text() ?? '' };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Clean Planner', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      tag: payload.tag,
      data: { url: payload.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Если приложение уже открыто — переключаемся на него, иначе открываем.
      for (const client of clientList) {
        const windowClient = client as WindowClient;
        if (windowClient.url.includes(self.location.origin)) {
          await windowClient.focus();
          await windowClient.navigate(target);
          return;
        }
      }

      await self.clients.openWindow(target);
    })()
  );
});
