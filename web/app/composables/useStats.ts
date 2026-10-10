import type { StatsOverview, StatsPeriod } from '~/types/stats';

/**
 * Данные раздела «Статистика».
 *
 * Период — часть ключа запроса, поэтому переключение «Неделя / Месяц /
 * За всё время» подгружает свой срез, а не фильтрует данные на клиенте:
 * сумма по «за всё время» на клиенте была бы неполной (история ограничена).
 */
export const useStats = async (period: Ref<StatsPeriod>) => {
  const auth = useAuthStore();
  const api = useApi();

  const state = useAsyncData(
    () => `stats-${period.value}`,
    () =>
      auth.isAuthenticated
        ? api.request<StatsOverview>(`/api/analytics/overview?period=${period.value}`)
        : Promise.resolve(null),
    { watch: [period] },
  );

  await state;

  const overview = computed(() => state.data.value ?? null);

  /** История по дням: сервер отдаёт плоский список, группировка нужна для таймлайна. */
  const historyByDay = computed(() => {
    const groups = new Map<string, StatsOverview['history']>();

    for (const item of overview.value?.history ?? []) {
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    }

    return [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({ date, items }));
  });

  return { overview, historyByDay, refresh: state.refresh, pending: state.pending };
};
