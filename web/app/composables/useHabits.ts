import type {
  Habit,
  HabitCategoryCount,
  HabitTemplate,
  HabitWeekDay,
  HabitsResponse,
} from '~/types/habit';

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
  /** Последние 7 дней: для графика отметок. */
  const week = computed<HabitWeekDay[]>(() => mineState.data.value?.week ?? []);
  const today = computed(() => mineState.data.value?.today ?? '');

  /**
   * Правка привычки: название, зона, периодичность, срок и напоминание.
   * Ответ сервера не разбираем — после PATCH перечитываем общий ключ
   * `habits-mine`, чтобы главная и вкладка привычек обновились одинаково.
   */
  const updateHabit = async (id: number, body: Record<string, unknown>) => {
    await api.request(`/api/habits/${id}`, { method: 'PATCH', body });
    await mineState.refresh();
  };

  /** Убрать привычку из списка: архив на сервере, история отметок остаётся. */
  const archiveHabit = async (id: number) => {
    await api.request(`/api/habits/${id}`, { method: 'DELETE' });
    await mineState.refresh();
  };

  return {
    habits,
    dueToday,
    doneToday,
    week,
    today,
    catalog: catalogState.data,
    categories: categoriesState.data,
    refreshMine: mineState.refresh,
    updateHabit,
    archiveHabit,
  };
};
