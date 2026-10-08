import type { Achievement, AchievementsProgressResponse } from '~/types/achievement';

/**
 * Достижения: справочник доступен всем, прогресс — только вошедшему.
 * Ключи общие, поэтому данные переиспользуются между главной и экраном достижений.
 */
export const useAchievements = async () => {
  const auth = useAuthStore();
  const api = useApi();

  const catalogState = useAsyncData(
    'achievements-catalog',
    () => api.request<Achievement[]>('/api/achievements'),
    { default: () => [] as Achievement[] },
  );

  const progressState = useAsyncData('achievements-progress', () =>
    auth.isAuthenticated
      ? api.request<AchievementsProgressResponse>('/api/achievements/progress')
      : Promise.resolve(null),
  );

  await Promise.all([catalogState, progressState]);

  const catalog = catalogState.data;
  const progress = computed(() => progressState.data.value?.achievements ?? []);
  const earned = computed(() => progressState.data.value?.earned ?? 0);
  const total = computed(() => progressState.data.value?.total ?? catalog.value.length);

  return { catalog, progress, earned, total, refresh: progressState.refresh };
};

interface ToastItem {
  code: string;
  name: string;
  description: string;
  icon: string;
}

/**
 * Уведомление о новом достижении.
 *
 * API возвращает коды выданных достижений в ответ на действие (отметил задачу,
 * привычку, пункт чек-листа). Здесь они превращаются в карточки-тосты; очередь
 * живёт в общем состоянии, а показывает её компонент в раскладке.
 */
export const useAchievementToast = () => {
  const api = useApi();
  const queue = useState<ToastItem[]>('achievement-toasts', () => []);

  const show = async (codes: string[] | undefined | null) => {
    if (!codes?.length) {
      return;
    }

    let catalog = useState<Achievement[]>('achievement-toast-catalog', () => []).value;

    if (catalog.length === 0) {
      try {
        catalog = await api.request<Achievement[]>('/api/achievements');
        useState<Achievement[]>('achievement-toast-catalog', () => []).value = catalog;
      } catch {
        catalog = [];
      }
    }

    const items = codes.map((code) => {
      const found = catalog.find((achievement) => achievement.code === code);

      return {
        code,
        name: found?.name ?? code,
        description: found?.description ?? '',
        icon: found?.icon ?? 'pi-trophy',
      };
    });

    queue.value = [...queue.value, ...items];
  };

  const dismiss = (code: string) => {
    queue.value = queue.value.filter((item) => item.code !== code);
  };

  return { queue, show, dismiss };
};
