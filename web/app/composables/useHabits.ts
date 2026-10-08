import type { Habit, HabitCategoryCount, HabitTemplate, HabitsResponse } from '~/types/habit';

/**
 * Привычки: каталог и категории — для всех, мои привычки — только для вошедшего.
 * Все useAsyncData вызываются синхронно: после await теряется контекст Nuxt.
 */
export const useHabits = async () => {
  const auth = useAuthStore();
  const api = useApi();

  const mineState = useAsyncData('habits-mine', () =>
    auth.isAuthenticated ? api.request<HabitsResponse>('/api/habits') : Promise.resolve(null),
  );

  const catalogState = useAsyncData(
    'habits-catalog',
    () => api.request<HabitTemplate[]>('/api/habits/templates'),
    { default: () => [] as HabitTemplate[] },
  );

  const categoriesState = useAsyncData(
    'habits-categories',
    () => api.request<HabitCategoryCount[]>('/api/habits/categories'),
    { default: () => [] as HabitCategoryCount[] },
  );

  await Promise.all([mineState, catalogState, categoriesState]);

  const habits = computed<Habit[]>(() => mineState.data.value?.habits ?? []);
  /** Что ещё не отмечено и актуально сегодня. */
  const dueToday = computed(() => habits.value.filter((habit) => habit.isDue && !habit.doneToday));
  const doneToday = computed(() => habits.value.filter((habit) => habit.doneToday));

  return {
    habits,
    dueToday,
    doneToday,
    catalog: catalogState.data,
    categories: categoriesState.data,
    refreshMine: mineState.refresh,
  };
};
