/**
 * Подписи зон дома.
 *
 * Зона — часть словаря, а не свободный текст. В базе она лежит русским названием
 * («Кухня», «Ванная», «По всему дому»): по этому значению считаются срезы в
 * статистике, группировка задач на главной и зоны в семейном плане. Поэтому
 * переводим зону на показе, а не храним перевод.
 *
 * Незнакомое значение возвращаем как есть. Так ведут себя две вещи, и обе
 * нормальны: своя зона, вписанная человеком руками, и уже переведённая строка
 * из справочника (шаблоны привычек и челленджи отдают зону на языке запроса —
 * переводить её второй раз не нужно).
 */
const ZONE_CODES: Record<string, string> = {
  Кухня: 'kitchen',
  Ванная: 'bathroom',
  Спальня: 'bedroom',
  Гостиная: 'livingRoom',
  Прихожая: 'hallway',
  Детская: 'kidsRoom',
  Кабинет: 'office',
  Балкон: 'balcony',
  Двор: 'yard',
  Гараж: 'garage',
  'По всему дому': 'wholeHouse',
  Окна: 'windows',
};

/**
 * Иконка зоны — по тому же коду, что и подпись.
 *
 * В строке задачи зона больше не пишется словами: маленький квадрат с иконкой
 * читается быстрее и не удлиняет подпись. Для неизвестной зоны (своя, вписанная
 * руками) иконки нет — там остаётся текст, иначе зона потерялась бы совсем.
 */
const ZONE_ICONS: Record<string, string> = {
  kitchen: 'pi-table',
  bathroom: 'pi-cloud',
  bedroom: 'pi-moon',
  livingRoom: 'pi-home',
  hallway: 'pi-key',
  kidsRoom: 'pi-users',
  office: 'pi-desktop',
  balcony: 'pi-sun',
  yard: 'pi-map',
  garage: 'pi-car',
  wholeHouse: 'pi-th-large',
  windows: 'pi-window-maximize',
};

export const useZoneLabel = () => {
  const { t } = useI18n();

  const zoneLabel = (value: string | null | undefined): string | null => {
    const zone = value?.trim();

    if (!zone) {
      return null;
    }

    const code = ZONE_CODES[zone];

    return code ? t(`tasks.zone.${code}`) : zone;
  };

  /** Иконка известной зоны; `null` — свободный текст, для него иконки нет. */
  const zoneIcon = (value: string | null | undefined): string | null => {
    const zone = value?.trim();

    if (!zone) {
      return null;
    }

    const code = ZONE_CODES[zone];

    return code ? (ZONE_ICONS[code] ?? null) : null;
  };

  return { zoneLabel, zoneIcon };
};
