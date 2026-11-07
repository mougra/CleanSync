/**
 * «Сегодня» — реактивное состояние приложения, а не вычисление на месте.
 *
 * Раньше день считался функцией `dayWithOffset(offset)` в момент вызова, а
 * `selectedDate` создавался один раз при монтировании. Реактивной зависимости у
 * этой пары не было, поэтому в полночь ничего не пересчитывалось: экран
 * продолжал подписывать вчерашний день «Сегодня», а `completed_on` уходил на
 * вчерашнюю дату — до перезагрузки страницы. Пользователь видел это как «отметил
 * в 00:10, а записалось во вчера».
 *
 * Теперь день — общее состояние (`useState`), которое:
 *  - совпадает при серверном рендере и гидратации (иначе вокруг полуночи Vue
 *    ругался на расхождение разметки);
 *  - пересчитывается плагином `plugins/app-day.client.ts` в полночь и при
 *    возврате на вкладку;
 *  - считается по **поясу устройства**, а не по поясу приложения: сервер получает
 *    этот день заголовком `X-Client-Date` и дальше живёт по нему (см. `useApi`).
 */

import { dayWithOffset, deviceOffsetMinutes } from '~/utils/deviceDay';

/** Общий знаменатель дня: смещение пояса устройства и сам календарный день. */
export const useAppDay = () => {
  /**
   * Смещение пояса: на сервере — из cookie (`plugins/timezone.client.ts`), в
   * браузере — из `getTimezoneOffset`. Значение здесь же обновляется, если пояс
   * сменился у открытой вкладки (переход на летнее время, поездка).
   */
  const deviceOffset = useState<number>('device-offset', () => useDeviceOffset());

  /**
   * Календарный день `YYYY-MM-DD` по часам устройства.
   *
   * Начальное значение — момент серверного рендера: тогда разметка сервера и
   * клиента совпадает, а браузер уточняет день сразу после гидратации.
   */
  const today = useState<string>('app-today', () => dayWithOffset(deviceOffset.value));

  /**
   * Пересчитать день и смещение пояса по часам устройства.
   *
   * Возвращает `true`, если календарный день действительно сменился: только
   * тогда имеет смысл перечитывать дневные данные. Вызывается из плагина, а не
   * из вычисляемых свойств: `new Date()` внутри `computed` даёт незаметно
   * устаревшее значение, когда ни одна реактивная зависимость не изменилась.
   */
  const sync = (moment: Date = new Date()): boolean => {
    const offset = deviceOffsetMinutes(moment);

    if (offset !== deviceOffset.value) {
      deviceOffset.value = offset;
    }

    const next = dayWithOffset(offset, moment);

    if (next === today.value) {
      return false;
    }

    today.value = next;

    return true;
  };

  return { today, deviceOffset, sync };
};

/**
 * День, выбранный в календаре.
 *
 * Отдельное состояние, а не `ref` страницы: его читают главная (какой план
 * показывать), полоса недели (какое число подсвечено) и плагин смены дня
 * (переехать ли на новый день). Ключ общий с прежними `useState('selected-date')`
 * в компонентах — SSR-payload остаётся совместимым.
 */
export const useSelectedDay = () => {
  const { today } = useAppDay();
  const selectedDate = useState<string>('selected-date', () => today.value);

  /** Выбран именно сегодняшний день: по этому признаку решается, «следовать» ли за полуночью. */
  const followsToday = computed(() => selectedDate.value === today.value);

  const selectDay = (iso: string) => {
    selectedDate.value = iso;
  };

  return { selectedDate, followsToday, selectDay };
};
