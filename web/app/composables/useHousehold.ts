import type { HouseholdResponse } from '~/types/household';

/**
 * Семейный режим: дом, участники, общий план и зоны.
 *
 * Все изменяющие запросы возвращают дом целиком, поэтому состояние обновляем
 * ответом сервера, а не догадками на клиенте: состав, план и статистика всегда
 * совпадают с базой.
 */
export const useHousehold = async () => {
  const auth = useAuthStore();
  const api = useApi();

  const state = useAsyncData('household', () =>
    auth.isAuthenticated
      ? api.request<HouseholdResponse>('/api/household')
      : Promise.resolve({ household: null } as HouseholdResponse),
  );

  await state;

  const data = computed(() => state.data.value ?? { household: null });
  const household = computed(() => data.value.household);
  const members = computed(() => data.value.members ?? []);
  const plan = computed(() => data.value.plan ?? []);
  const zones = computed(() => data.value.zones ?? []);
  const isOwner = computed(() => data.value.role === 'owner');
  const hasHousehold = computed(() => household.value !== null);

  const apply = (updated: HouseholdResponse) => {
    state.data.value = updated;
  };

  const createHousehold = async (name: string) => {
    apply(await api.request<HouseholdResponse>('/api/household', {
      method: 'POST',
      body: { name },
    }));
  };

  const joinHousehold = async (code: string) => {
    apply(await api.request<HouseholdResponse>('/api/household/join', {
      method: 'POST',
      body: { code },
    }));
  };

  const renameHousehold = async (name: string) => {
    apply(await api.request<HouseholdResponse>('/api/household', {
      method: 'PATCH',
      body: { name },
    }));
  };

  const leaveHousehold = async () => {
    await api.request('/api/household/leave', { method: 'POST' });
    apply({ household: null });
  };

  const removeMember = async (userId: number) => {
    apply(await api.request<HouseholdResponse>(`/api/household/members/${userId}`, {
      method: 'DELETE',
    }));
  };

  const createList = async (title: string) => {
    apply(await api.request<HouseholdResponse>('/api/household/plan', {
      method: 'POST',
      body: { title },
    }));
  };

  const addTask = async (
    scheduleId: number,
    task: { title: string; room?: string; minutes?: number; assigneeId?: number | null },
  ) => {
    apply(await api.request<HouseholdResponse>(`/api/household/plan/${scheduleId}/tasks`, {
      method: 'POST',
      body: task,
    }));
  };

  const updateTask = async (
    taskId: number,
    patch: { title?: string; room?: string | null; minutes?: number; assigneeId?: number | null },
  ) => {
    apply(await api.request<HouseholdResponse>(`/api/household/tasks/${taskId}`, {
      method: 'PATCH',
      body: patch,
    }));
  };

  const deleteTask = async (taskId: number) => {
    apply(await api.request<HouseholdResponse>(`/api/household/tasks/${taskId}`, {
      method: 'DELETE',
    }));
  };

  /** Отметить задачу выполненной — через общий маршрут задач: он же считает серию. */
  const toggleTask = async (taskId: number, isCompleted: boolean) => {
    await api.request(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: { is_completed: isCompleted },
    });

    await state.refresh();
  };

  const nudge = async (userId: number) => {
    await api.request(`/api/household/nudge/${userId}`, { method: 'POST' });
  };

  return {
    household,
    members,
    plan,
    zones,
    isOwner,
    hasHousehold,
    refresh: state.refresh,
    createHousehold,
    joinHousehold,
    renameHousehold,
    leaveHousehold,
    removeMember,
    createList,
    addTask,
    updateTask,
    deleteTask,
    toggleTask,
    nudge,
  };
};
