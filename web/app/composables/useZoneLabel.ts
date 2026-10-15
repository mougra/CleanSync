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

  return { zoneLabel };
};
