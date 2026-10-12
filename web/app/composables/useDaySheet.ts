/**
 * Состояние шторки дня: какая дата открыта и открыта ли она вообще.
 *
 * Календарь живёт в раскладке (`WeekStrip`), а лист с планом дня — там же, рядом
 * с остальными шторками: открыть его нужно из календаря, а данные он берёт сам.
 * Поэтому состояние открытия и выбранная дата лежат в общем `useState`, а не в
 * локальных `ref` каждого компонента — иначе календарь и лист разошлись бы.
 */
export const useDaySheet = () => {
  const open = useState<boolean>('day-sheet-open', () => false);
  const date = useState<string>('day-sheet-date', () => toISODate(new Date()));

  /** Открыть лист конкретного дня: дату задаёт клик по числу в календаре. */
  const openSheet = (iso: string) => {
    date.value = iso;
    open.value = true;
  };

  const closeSheet = () => {
    open.value = false;
  };

  return { open, date, openSheet, closeSheet };
};
