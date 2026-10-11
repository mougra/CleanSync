import type {
  ActiveChallenge,
  ActiveChallengeResponse,
  ChallengeDay,
  ChallengeSummary,
  ChallengeTask,
  ChallengeTaskToggleResponse,
  CurrentChallenge,
} from '~/types/challenge';

/**
 * Челленджи — отдельная сущность, а не часть «Плана на сегодня».
 *
 * Источник правды для главной — `GET /api/challenges/current`: сезонный челлендж
 * пользователя в одном из состояний (available / active / completed / none).
 * Отдельно читаем `GET /api/challenges/active` — это челлендж, который человек
 * реально проходит; он может относиться и к другому сезону (в макете главной
 * «Весенняя уборка — в процессе» стоит рядом с сезонным «Осенним обновлением»).
 *
 * Важно: все useAsyncData вызываются синхронно, до любого await. Если вызвать
 * второй после await, теряется контекст Nuxt и падает с «composable called
 * outside of setup». Дожидаемся результатов уже после всех вызовов.
 * Ключи общие, поэтому данные переиспользуются между страницами.
 */
export const useChallenges = async () => {
  const auth = useAuthStore();
  const api = useApi();

  const listState = useAsyncData('challenges', () => api.request<ChallengeSummary[]>('/api/challenges'), {
    default: () => [] as ChallengeSummary[],
  });

  /**
   * Ключ оставлен прежним ('active-challenge'): его чистят при входе, выходе и
   * сбросе данных (AppAuthLink, AppSidebarProfile, login, settings).
   */
  const currentState = useAsyncData<CurrentChallenge>(
    'active-challenge',
    async () => {
      if (!auth.isAuthenticated) {
        return { status: 'none' } as CurrentChallenge;
      }

      try {
        const result = await api.request<CurrentChallenge>('/api/challenges/current');

        if (result && typeof result.status === 'string') {
          return result;
        }
      } catch {
        // Эндпоинт недоступен (старая сборка бэкенда или сбой) — соберём состояние
        // из прежних методов, чтобы главная не осталась без челленджа.
      }

      return await fallbackCurrent();
    },
    { default: () => ({ status: 'none' }) as CurrentChallenge },
  );

  /** Незакрытый челлендж пользователя: прогресс, дни и отметки. */
  const activeState = useAsyncData<ActiveChallengeResponse | null>('challenges-active', () =>
    auth.isAuthenticated
      ? api.request<ActiveChallengeResponse>('/api/challenges/active')
      : Promise.resolve(null),
  );

  await Promise.all([listState, currentState, activeState]);

  const list = listState.data;
  const current = computed<CurrentChallenge>(() => currentState.data.value ?? { status: 'none' });
  const active = computed<ActiveChallenge | null>(() => activeState.data.value?.active ?? null);

  /** Сезонный челлендж из ответа — для карточки и проверок на странице челленджа. */
  const seasonChallenge = computed<ChallengeSummary | null>(() =>
    'challenge' in current.value && current.value.challenge ? current.value.challenge : null,
  );

  /** Челленджи, которые пользователь не проходит: остальные сезоны и будущие. */
  const available = computed(() =>
    (list.value ?? []).filter(
      (challenge) =>
        challenge.slug !== active.value?.challenge.slug && challenge.slug !== seasonChallenge.value?.slug,
    ),
  );

  /**
   * Отметка применяется к тому состоянию, в котором лежит задача: сезонное
   * («active-challenge») или начатое в другом сезоне («challenges-active»).
   */
  const hostOf = (taskId: number): { source: 'current' | 'active'; days: ChallengeDay[] } | null => {
    const state = currentState.data.value;

    if (state && 'days' in state && state.days?.some((day) => day.tasks.some((task) => task.id === taskId))) {
      return { source: 'current', days: state.days };
    }

    const running = activeState.data.value?.active;

    if (running?.days.some((day) => day.tasks.some((task) => task.id === taskId))) {
      return { source: 'active', days: running.days };
    }

    return null;
  };

  /** Снимок обоих состояний: нужен, чтобы откатить оптимистичную отметку. */
  const snapshot = (): { current: CurrentChallenge | null; active: ActiveChallengeResponse | null } => ({
    current: currentState.data.value
      ? (JSON.parse(JSON.stringify(currentState.data.value)) as CurrentChallenge)
      : null,
    active: activeState.data.value
      ? (JSON.parse(JSON.stringify(activeState.data.value)) as ActiveChallengeResponse)
      : null,
  });

  const restore = (before: ReturnType<typeof snapshot>) => {
    currentState.data.value = before.current ?? { status: 'none' };
    activeState.data.value = before.active;
  };

  const applyServerDays = (source: 'current' | 'active', response: ChallengeTaskToggleResponse) => {
    if (source === 'current') {
      const state = currentState.data.value;

      if (state?.status === 'available') {
        currentState.data.value = {
          status: 'active',
          season: state.season,
          userChallengeId: response.userChallengeId,
          startedAt: null,
          challenge: state.challenge,
          progress: response.progress,
          days: response.days,
        };
      } else if (state?.status === 'active') {
        state.userChallengeId = response.userChallengeId;
        state.progress = response.progress;
        state.days = response.days;
      }

      return;
    }

    const running = activeState.data.value?.active;

    if (running) {
      running.userChallengeId = response.userChallengeId;
      running.status = response.status;
      running.progress = response.progress;
      running.days = response.days;
    }
  };

  /**
   * Отметка задачи — в один тап, без предварительного «старта».
   *
   * Оптимистично: галочка и прогресс меняются сразу. Если запрос упал, состояние
   * возвращается к снимку, а ошибку обрабатывает страница (тост/строка).
   */
  const toggleTask = async (task: ChallengeTask): Promise<{ awarded: string[] }> => {
    const host = hostOf(task.id);
    const next = !task.is_done;

    if (!host) {
      return { awarded: [] };
    }

    const before = snapshot();
    task.is_done = next;

    const localProgress = summarizeChallengeDays(host.days);

    if (host.source === 'current') {
      const state = currentState.data.value;

      if (state && 'progress' in state && state.progress) {
        state.progress = localProgress;
      }
    } else if (activeState.data.value?.active) {
      activeState.data.value.active.progress = localProgress;
    }

    try {
      const response = await api.request<ChallengeTaskToggleResponse>(
        `/api/challenges/tasks/${task.id}`,
        { method: 'PATCH', body: { isDone: next } },
      );

      applyServerDays(host.source, response);

      return { awarded: response.awarded ?? [] };
    } catch (error) {
      restore(before);
      throw error;
    }
  };

  /**
   * Завершение челленджа: «пройден» для пользователя. Идемпотентно на сервере,
   * поэтому повторный вызов после сетевой ошибки безопасен.
   */
  const finish = async (slug: string) => {
    await api.request(`/api/challenges/${slug}/finish`, { method: 'POST' });
    await refresh();
  };

  /** Перечитать состояние челленджей: после отметки, завершения или входа. */
  const refresh = async () => {
    await Promise.all([currentState.refresh(), activeState.refresh()]);
  };

  /**
   * Запасной путь, если `GET /api/challenges/current` недоступен: собираем
   * состояние из `GET /api/challenges/active` и списка челленджей
   * (сезон считаем по дате).
   */
  const fallbackCurrent = async (): Promise<CurrentChallenge> => {
    const running = await api
      .request<ActiveChallengeResponse>('/api/challenges/active')
      .catch(() => ({ active: null }) as ActiveChallengeResponse);

    if (running.active) {
      return {
        status: 'active',
        userChallengeId: running.active.userChallengeId,
        startedAt: running.active.startedAt ?? null,
        challenge: running.active.challenge,
        progress: running.active.progress,
        days: running.active.days,
      };
    }

    const challenges = await api
      .request<ChallengeSummary[]>('/api/challenges')
      .catch(() => [] as ChallengeSummary[]);

    const season = seasonForDate(new Date());
    const seasonal = challenges.find((challenge) => challenge.season === season);

    if (!seasonal) {
      return { status: 'none', season };
    }

    return {
      status: 'available',
      season,
      challenge: seasonal,
      progress: { done: 0, total: seasonal.tasks_count, percent: 0, minutesLeft: 0, currentDay: null },
      days: [],
    };
  };

  return {
    list,
    current,
    active,
    seasonChallenge,
    available,
    refresh,
    /** Прежнее имя метода: страницы вызывали refreshActive после отметок. */
    refreshActive: refresh,
    toggleTask,
    finish,
  };
};
