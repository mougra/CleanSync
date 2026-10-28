import type { TaskFrequency } from '~/types/checklist';
import { repeatLabel } from '~/utils/repeatLabel';

/**
 * Подпись периодичности задачи словами: «раз в неделю», «раз в 3 месяца».
 *
 * Вынесено из страницы «Сегодня» в общее место, потому что тот же текст нужен
 * разделу «Мои задачи»: два экрана не должны называть одну частоту по-разному.
 * Само преобразование дней в единицы живёт в `utils/repeatLabel.ts`.
 */
export const useTaskRepeatLabel = (): ((
  task: { frequency: TaskFrequency | null; interval_count: number | null },
) => string | null) => {
  const { t, locale } = useI18n();

  return (task) => {
    const parts = repeatLabel(task.frequency, task.interval_count);

    if (parts.kind === 'none') {
      return null;
    }

    if (parts.kind === 'once') {
      return t('plan.repeatOnce');
    }

    if (parts.kind === 'phrase') {
      return t(`plan.${parts.key}`);
    }

    const forms =
      parts.unit === 'day'
        ? [t('plan.unitDayOne'), t('plan.unitDayFew'), t('plan.unitDayMany')]
        : parts.unit === 'week'
          ? [t('plan.unitWeekOne'), t('plan.unitWeekFew'), t('plan.unitWeekMany')]
          : [t('plan.unitMonthOne'), t('plan.unitMonthFew'), t('plan.unitMonthMany')];

    const unit =
      locale.value === 'ru'
        ? pluralRu(parts.count, forms[0]!, forms[1]!, forms[2]!)
        : pluralEn(parts.count, forms[0]!, forms[2]!);

    return t('plan.repeatN', { count: parts.count, unit });
  };
};
