/**
 * Смена календарного дня в уже открытой вкладке.
 *
 * Без этого плагина «Сегодня» замирало на дне открытия страницы: ни подпись, ни
 * `selectedDate`, ни `GET /api/tasks/today` не пересчитывались, поэтому отметка
 * после полуночи уходила на вчерашнюю дату, а новый день появлялся только после
 * F5. Проблема видна именно на живой вкладке (в том числе восстановленной после
 * сна или перезапуска браузера), а не на свежей загрузке.
 *
 * Механика:
 *  1. Таймер ставится ровно на ближайшую местную полночь — пока вкладка видима,
 *     «Сегодня» переключается в тот же момент, а не через минуту.
 *  2. Страховки на случай, когда таймер не сработал вовремя: браузер душит
 *     таймеры в фоновых вкладках, а после сна/гибернации они срабатывают с
 *     опозданием. Поэтому день проверяется ещё и при возврате на вкладку
 *     (`visibilitychange`), при `pageshow` из bfcache, при фокусе окна, при
 *     появлении сети и раз в минуту, пока вкладка видима.
 *  3. День переезжает только если человек смотрел «Сегодня». Если он специально
 *     открыл другую дату, экран остаётся на ней — меняются только данные,
 *     зависящие от текущего дня (серия, привычки, кольца недели).
 *
 * Фоновая вкладка ничего не запрашивает: проверка выходит сразу, если страница
 * скрыта, — на телефоне это лишние пробуждения радио. При возврате всё
 * досчитается одним движением.
 */

import { deviceOffsetMinutes, msUntilLocalMidnight, saveTimezoneOffset } from '~/utils/deviceDay';

/** Как часто сверять день, пока вкладка видима: страховка от «заснувших» таймеров. */
const WATCHDOG_MS = 60_000;

export default defineNuxtPlugin((nuxtApp) => {
  const { today, sync } = useAppDay();
  const { selectedDate } = useSelectedDay();

  let midnight: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let refreshing = false;

  /**
   * Один цикл проверки: пересчитать день и, если он сменился, перечитать экран.
   *
   * `refreshNuxtData()` без ключей обновляет всё, что сейчас загружено: план дня
   * (`today-plan`), день карточки (`calendar-day`), кольца недели, серию,
   * привычки, прогресс достижений. Список ключей не дублируем здесь: он уже
   * собирается в компонентах, а забытый ключ оставил бы на экране вчерашние
   * числа до следующей отметки.
   */
  const refresh = async () => {
    if (refreshing) {
      return;
    }

    const previous = today.value;

    if (!sync()) {
      return;
    }

    // Пояс мог смениться (летнее время, поездка) — cookie для серверного рендера
    // должна говорить то же, что браузер.
    saveTimezoneOffset(deviceOffsetMinutes());

    // Человек смотрел ровно тот день, который только что закончился, — значит он
    // «следует за сегодня» и должен увидеть новый. Выбранную вручную дату не
    // трогаем.
    if (selectedDate.value === previous) {
      selectedDate.value = today.value;
    }

    refreshing = true;

    try {
      await nuxtApp.runWithContext(() => refreshNuxtData());
    } catch {
      // Смена дня не должна ломать страницу: данные догонят при следующем
      // действии или заходе, а сам день уже переключён.
    } finally {
      refreshing = false;
    }
  };

  /** Проверка только на видимой странице: скрытая вкладка не ходит в сеть. */
  const check = async () => {
    if (document.visibilityState !== 'visible') {
      return;
    }

    await refresh();
  };

  /** Таймер на ближайшую полночь. После срабатывания ставится следующий. */
  const scheduleMidnight = () => {
    if (midnight) {
      clearTimeout(midnight);
    }

    midnight = setTimeout(() => {
      void check();
      scheduleMidnight();
    }, msUntilLocalMidnight());
  };

  const start = () => {
    if (watchdog) {
      return;
    }

    scheduleMidnight();
    watchdog = setInterval(() => void check(), WATCHDOG_MS);
  };

  const stop = () => {
    if (midnight) {
      clearTimeout(midnight);
      midnight = null;
    }

    if (watchdog) {
      clearInterval(watchdog);
      watchdog = null;
    }
  };

  // После гидратации день мог разойтись с серверным (cookie пояса устарела или
  // её не было). Сверяем сразу и заводим таймеры.
  nuxtApp.hook('app:mounted', () => {
    void check();
    start();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void check();
    }
  });

  window.addEventListener('focus', () => void check());
  window.addEventListener('online', () => void check());

  // bfcache: страница «оживает» с прежним состоянием, таймеры за это время
  // остановлены. `pageshow` с `persisted` — единственный надёжный сигнал.
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) {
      return;
    }

    void check();
    start();
  });
});
