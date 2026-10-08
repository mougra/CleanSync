import type {
  ChecklistDetail,
  ChecklistSummary,
  ChecklistTemplate,
  OwnSchedule,
} from '~/types/checklist';

/**
 * Чек-листы: шаблоны видны всем, личные списки — только владельцу.
 *
 * Пункт чек-листа — это задача, поэтому отметки и добавление пунктов идут
 * через `/api/tasks`, а сюда вынесены только шаблоны, копирование и прогресс.
 */
export const useChecklists = async () => {
  const auth = useAuthStore();
  const api = useApi();

  const templatesState = useAsyncData(
    'checklist-templates',
    () => api.request<ChecklistTemplate[]>('/api/checklists/templates'),
    { default: () => [] as ChecklistTemplate[] },
  );

  const mineState = useAsyncData('checklists-mine', () =>
    auth.isAuthenticated ? api.request<ChecklistSummary[]>('/api/checklists') : Promise.resolve(null),
  );

  const ownState = useAsyncData('own-schedules', () =>
    auth.isAuthenticated ? api.request<OwnSchedule[]>('/api/schedules') : Promise.resolve(null),
  );

  await Promise.all([templatesState, mineState, ownState]);

  const templates = templatesState.data;
  const mine = computed<ChecklistSummary[]>(() => mineState.data.value ?? []);

  const own = computed<OwnSchedule[]>(() =>
    (ownState.data.value ?? []).filter(
      (schedule) => !mine.value.some((checklist) => checklist.id === schedule.id),
    ),
  );

  /** Шаблон уже добавлен? Нужно, чтобы показать прогресс вместо кнопки. */
  const addedByTemplate = computed(() => {
    const map = new Map<number, ChecklistSummary>();

    for (const checklist of mine.value) {
      if (checklist.source_template_id) {
        map.set(checklist.source_template_id, checklist);
      }
    }

    return map;
  });

  const addFromTemplate = async (templateId: number) => {
    const result = await api.request<{ checklist: ChecklistDetail }>(
      `/api/checklists/from-template/${templateId}`,
      { method: 'POST' },
    );

    await Promise.all([mineState.refresh(), ownState.refresh()]);
    return result.checklist;
  };

  const remove = async (id: number) => {
    await api.request(`/api/checklists/${id}`, { method: 'DELETE' });
    await Promise.all([mineState.refresh(), ownState.refresh()]);
  };

  const createOwn = async (title: string) => {
    const created = await api.request<OwnSchedule>('/api/schedules', {
      method: 'POST',
      body: { title },
    });

    await ownState.refresh();
    return created;
  };

  return {
    templates,
    mine,
    own,
    addedByTemplate,
    addFromTemplate,
    remove,
    createOwn,
    refresh: () => Promise.all([mineState.refresh(), ownState.refresh()]),
  };
};

/** Один список с пунктами: используется на странице чек-листа. */
export const useChecklist = (id: number) =>
  useAsyncData(`checklist-${id}`, async () => {
    const api = useApi();
    const result = await api.request<{ checklist: ChecklistDetail }>(`/api/checklists/${id}`);
    return result.checklist;
  });
