import type { HabitIntervalUnit } from '~/types/habit';

/**
 * Подписи для привычек: категория и период повторения.
 * Период собирается из числа и единицы: «Каждый день», «Каждые 3 дня», «Раз в неделю».
 */
export const useHabitLabels = () => {
  const { t, locale } = useI18n();

  const categoryLabel = (code: string | null): string =>
    code ? t(`habitCategory.${code}`) : t('habitCategory.custom');

  const intervalLabel = (count: number, unit: HabitIntervalUnit): string => {
    const isRu = locale.value === 'ru';

    if (unit === 'once') {
      return t('habitInterval.once');
    }

    if (count <= 1) {
      return t(`habitInterval.every_${unit}`);
    }

    const unitWord = isRu
      ? unit === 'day'
        ? pluralRu(count, 'день', 'дня', 'дней')
        : unit === 'week'
          ? pluralRu(count, 'неделю', 'недели', 'недель')
          : pluralRu(count, 'месяц', 'месяца', 'месяцев')
      : unit === 'day'
        ? pluralEn(count, 'day', 'days')
        : unit === 'week'
          ? pluralEn(count, 'week', 'weeks')
          : pluralEn(count, 'month', 'months');

    return t('habitInterval.everyN', { count, unit: unitWord });
  };

  return { categoryLabel, intervalLabel };
};
