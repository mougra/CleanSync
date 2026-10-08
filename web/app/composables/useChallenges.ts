import type { ActiveChallenge, ActiveChallengeResponse, ChallengeSummary } from '~/types/challenge';

/**
 * Челленджи: список для всех и активный — только для вошедшего.
 *
 * Важно: оба useAsyncData вызываются синхронно, до любого await. Если вызвать
 * второй после await, теряется контекст Nuxt и падает с «composable called
 * outside of setup». Дожидаемся результатов уже после обоих вызовов.
 * Ключи общие, поэтому данные переиспользуются между страницами.
 */
export const useChallenges = async () => {
  const auth = useAuthStore();
  const api = useApi();

  const listState = useAsyncData('challenges', () => api.request<ChallengeSummary[]>('/api/challenges'), {
    default: () => [] as ChallengeSummary[],
  });

  const activeState = useAsyncData('active-challenge', () =>
    auth.isAuthenticated
      ? api.request<ActiveChallengeResponse>('/api/challenges/active')
      : Promise.resolve(null),
  );

  await Promise.all([listState, activeState]);

  const list = listState.data;
  const active = computed<ActiveChallenge | null>(() => activeState.data.value?.active ?? null);

  /** Челленджи, которые пользователь ещё не начал. */
  const available = computed(() =>
    (list.value ?? []).filter((challenge) => challenge.slug !== active.value?.challenge.slug),
  );

  return { list, active, available, refreshActive: activeState.refresh };
};
