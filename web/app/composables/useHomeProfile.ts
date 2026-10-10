import type { HomePlan, HomeProfile } from '~/types/homeProfile';

/**
 * Мастер «Настройка по дому»: анкета и генерация плана.
 *
 * Ответы сохраняем на каждом шаге (`PUT` с частью полей), поэтому закрытая
 * на середине модалка ничего не теряет. Генерацию плана делает сервер: правила
 * подбора живут рядом с каталогом задач, а не в интерфейсе.
 */
export const useHomeProfile = async () => {
  const auth = useAuthStore();
  const api = useApi();

  const state = useAsyncData('home-profile', () =>
    auth.isAuthenticated
      ? api.request<{ profile?: HomeProfile | null } & HomeProfile>('/api/home-profile')
      : Promise.resolve(null),
  );

  await state;

  // Сервер может вернуть как `{ profile }`, так и сам профиль — читаем оба вида.
  const profile = computed<HomeProfile | null>(() => {
    const value = state.data.value;

    if (!value) {
      return null;
    }

    return (value.profile ?? value) as HomeProfile;
  });

  const completed = computed(() => Boolean(profile.value?.completedAt));

  const saving = ref(false);
  const saveError = ref(false);

  /**
   * Сохранить часть ответов.
   *
   * `complete` выставляется на последнем шаге: сервер по нему понимает, что
   * анкету прошли до конца, и только тогда отмечает её заполненной.
   * Пустые ответы (пропущенные шаги) не отправляем — у сервера для них есть
   * значения по умолчанию, а `null` он считает неверным значением.
   */
  const save = async (patch: Partial<HomeProfile>, options: { complete?: boolean } = {}) => {
    const body: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (Array.isArray(value) && value.length === 0) {
        continue;
      }

      body[key] = value;
    }

    if (options.complete) {
      body.complete = true;
    }

    if (Object.keys(body).length === 0) {
      return;
    }

    saving.value = true;
    saveError.value = false;

    try {
      const updated = await api.request<{ profile?: HomeProfile | null } & HomeProfile>(
        '/api/home-profile',
        { method: 'PUT', body },
      );

      state.data.value = updated;
    } catch {
      saveError.value = true;
    } finally {
      saving.value = false;
    }
  };

  const generatePlan = async (): Promise<HomePlan> =>
    api.request<HomePlan>('/api/home-profile/plan', { method: 'POST' });

  return { profile, completed, saving, saveError, save, generatePlan, refresh: state.refresh };
};
