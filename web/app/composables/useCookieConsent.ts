/**
 * Согласие на аналитические cookie.
 *
 * До появления Метрики баннер только информировал: кроме технических cookie
 * (вход, CSRF, тема, язык) на сайте ничего не было, и спрашивать было не о чем.
 * С Метрикой появляется третья сторона — её скрипт ставит свои cookie и
 * отправляет данные за пределы сайта, — значит, нужен **выбор**, а не
 * уведомление: счётчик грузится только после явного согласия.
 *
 * Что означает согласие технически:
 *  - `essential` — только технические cookie, скрипт Метрики не загружается,
 *    ни одного запроса на mc.yandex.ru;
 *  - `all` — аналитика включена.
 *
 * Хранение одно на весь сайт: тот же ключ localStorage, что и раньше, поэтому
 * у тех, кто уже нажал «Понятно», согласие сохраняется — старое значение
 * `accepted` читается как `all` (они согласились, когда аналитики не было;
 * трактовать это как отказ было бы неверно, но и навязывать нельзя — поэтому
 * значение остаётся как есть, а баннер не показывается повторно).
 */

export type CookieConsentValue = 'essential' | 'all';

const STORAGE_KEY = 'tidyplan-cookies-notice';

const isConsent = (value: string | null): value is CookieConsentValue =>
  value === 'essential' || value === 'all';

export const useCookieConsent = () => {
  const consent = useState<CookieConsentValue | null>('cookie-consent', () => null);
  const ready = useState<boolean>('cookie-consent-ready', () => false);

  /** Чтение из localStorage: только в браузере, до монтирования значение неизвестно. */
  const load = () => {
    if (!import.meta.client) return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (isConsent(raw)) {
        consent.value = raw;
      } else if (raw === 'accepted') {
        // Значение первой версии баннера: тогда аналитики не было.
        consent.value = 'all';
      }
    } catch {
      // Приватный режим: считаем, что выбора нет, и показываем баннер.
      consent.value = null;
    } finally {
      ready.value = true;
    }
  };

  const accept = (value: CookieConsentValue) => {
    consent.value = value;

    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Не смогли запомнить — баннер больше не покажем в этой сессии, и ладно.
    }
  };

  /** Аналитику можно включать: выбор сделан и он в пользу аналитики. */
  const analyticsAllowed = computed(() => consent.value === 'all');

  return { consent, ready, load, accept, analyticsAllowed };
};
