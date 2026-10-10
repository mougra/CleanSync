import type { StreakState } from '~/types/streak';

/**
 * Личная серия, заморозки и недельная цель.
 *
 * Ключ общий с экраном статистики: после отметки задачи достаточно вызвать
 * `refresh()`, чтобы карточка на главной обновилась вместе с данными.
 */
export const useStreak = async () => {
  const auth = useAuthStore();
  const api = useApi();

  const state = useAsyncData('streak', () =>
    auth.isAuthenticated ? api.request<StreakState>('/api/streak') : Promise.resolve(null),
  );

  await state;

  const streak = computed(() => state.data.value ?? null);

  const setWeeklyGoal = async (weeklyDays: number) => {
    const updated = await api.request<StreakState>('/api/streak/goal', {
      method: 'PATCH',
      body: { weeklyDays },
    });

    state.data.value = updated;
  };

  return { streak, refresh: state.refresh, setWeeklyGoal };
};
