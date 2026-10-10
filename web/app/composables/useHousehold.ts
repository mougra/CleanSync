import type {
  HouseholdEntry,
  HouseholdListResponse,
  HouseholdMutationResponse,
} from '~/types/household';

/**
 * Семейный режим: дома, участники, общий план и зоны.
 *
 * У пользователя может быть несколько домов, поэтому состояние — это список.
 * Для интерфейса выбираем один дом: `selectedHouseholdId` (на главной и по
 * умолчанию — первый в списке, то есть свой). Все изменяющие запросы возвращают
 * актуальный список домов, поэтому состояние обновляем ответом сервера, а не
 * догадками на клиенте: состав, план и статистика всегда совпадают с базой.
 */
export const useHousehold = async () => {
  const auth = useAuthStore();
  const api = useApi();

  const state = useAsyncData('households', () =>
    auth.isAuthenticated
      ? api.request<HouseholdListResponse>('/api/household')
      : Promise.resolve<HouseholdListResponse>({ households: [] }),
  );

  await state;

  const data = computed<HouseholdListResponse>(() => state.data.value ?? { households: [] });
  const households = computed<HouseholdEntry[]>(() => data.value.households ?? []);
  const hasHousehold = computed(() => households.value.length > 0);
  const primary = computed<HouseholdEntry | null>(() => households.value[0] ?? null);

  /** Выбранный дом: явный выбор, иначе основной. */
  const selectedHouseholdId = ref<number | null>(null);

  const selected = computed<HouseholdEntry | null>(
    () =>
      households.value.find((entry) => entry.household.id === selectedHouseholdId.value) ??
      primary.value,
  );

  const household = computed(() => selected.value?.household ?? null);
  const role = computed(() => selected.value?.role ?? null);
  const isOwner = computed(() => role.value === 'owner');
  const ownerHousehold = computed(
    () => households.value.find((entry) => entry.role === 'owner') ?? null,
  );

  /** Содержимое выбранного дома: на главной это первый дом пользователя. */
  const members = computed(() => selected.value?.members ?? []);
  const plan = computed(() => selected.value?.plan ?? []);
  const zones = computed(() => selected.value?.zones ?? []);

  const apply = (updated: HouseholdListResponse) => {
    state.data.value = updated;
  };

  /** Дом, к которому относится запрос: явный или выбранный. */
  const idFor = (householdId?: number | null) =>
    householdId ?? selected.value?.household.id ?? null;

  const createHousehold = async (name: string) => {
    const updated = await api.request<HouseholdMutationResponse>('/api/household', {
      method: 'POST',
      body: { name },
    });

    apply(updated);

    if (updated.household) {
      selectedHouseholdId.value = updated.household.household.id;
    }
  };

  const joinHousehold = async (code: string) => {
    const updated = await api.request<HouseholdMutationResponse>('/api/household/join', {
      method: 'POST',
      body: { code },
    });

    apply(updated);

    if (updated.household) {
      selectedHouseholdId.value = updated.household.household.id;
    }
  };

  const renameHousehold = async (name: string, householdId?: number | null) => {
    apply(
      await api.request<HouseholdMutationResponse>('/api/household', {
        method: 'PATCH',
        body: { name, householdId: idFor(householdId) },
      }),
    );
  };

  const leaveHousehold = async (householdId?: number | null) => {
    apply(
      await api.request<HouseholdMutationResponse>('/api/household/leave', {
        method: 'POST',
        body: { householdId: idFor(householdId) },
      }),
    );
  };

  const removeMember = async (userId: number, householdId?: number | null) => {
    apply(
      await api.request<HouseholdMutationResponse>(`/api/household/members/${userId}`, {
        method: 'DELETE',
        body: { householdId: idFor(householdId) },
      }),
    );
  };

  const createList = async (title: string, householdId?: number | null) => {
    apply(
      await api.request<HouseholdMutationResponse>('/api/household/plan', {
        method: 'POST',
        body: { title, householdId: idFor(householdId) },
      }),
    );
  };

  const addTask = async (
    scheduleId: number,
    task: { title: string; room?: string; minutes?: number; assigneeId?: number | null },
  ) => {
    // Дом берётся из самого списка на сервере, идентификатор тут не нужен
    apply(
      await api.request<HouseholdMutationResponse>(`/api/household/plan/${scheduleId}/tasks`, {
        method: 'POST',
        body: task,
      }),
    );
  };

  const updateTask = async (
    taskId: number,
    patch: { title?: string; room?: string | null; minutes?: number; assigneeId?: number | null },
  ) => {
    apply(
      await api.request<HouseholdMutationResponse>(`/api/household/tasks/${taskId}`, {
        method: 'PATCH',
        body: patch,
      }),
    );
  };

  const deleteTask = async (taskId: number) => {
    apply(
      await api.request<HouseholdMutationResponse>(`/api/household/tasks/${taskId}`, {
        method: 'DELETE',
      }),
    );
  };

  /** Отметить задачу выполненной — через общий маршрут задач: он же считает серию. */
  const toggleTask = async (taskId: number, isCompleted: boolean) => {
    await api.request(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: { is_completed: isCompleted },
    });

    await state.refresh();
  };

  const nudge = async (userId: number, householdId?: number | null) => {
    await api.request(`/api/household/nudge/${userId}`, {
      method: 'POST',
      body: { householdId: idFor(householdId) },
    });
  };

  /** Дом, который показываем на главной: свой, если он есть, иначе первый. */
  const homeHousehold = computed(() => ownerHousehold.value ?? primary.value);

  return {
    households,
    selected,
    selectedHouseholdId,
    household,
    homeHousehold,
    role,
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
