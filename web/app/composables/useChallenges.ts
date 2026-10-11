import type {
  ActiveChallenge,
  ActiveChallengeResponse,
  ChallengeDay,
  ChallengeProgress,
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
/**
 * Подменяет `cp_access` в строке cookie — вынесено в `utils/authCookie.ts`,
 * потому что тем же помощником пользуется `useApi` при восстановлении сессии.
 */
export const useChallenges = async () => {
  const auth = useAuthStore();
  const api = useApi();
  // Гостевой путь: отметки незарегистрированного человека живут в localStorage.
  const guest = useGuestChallenge();

  const config = useRuntimeConfig();
  /**
   * Cookie входящего запроса забираем синхронно, до первого await: после него
   * контекст Nuxt теряется — по той же причине так делает `useApi`.
   */
  const ssrCookie = import.meta.server ? useRequestHeaders(['cookie']).cookie : undefined;

  const listState = useAsyncData('challenges', () => api.request<ChallengeSummary[]>('/api/challenges'), {
    default: () => [] as ChallengeSummary[],
  });

  /**
   * Ключ оставлен прежним ('active-challenge'): его чистят при входе, выходе и
   * сбросе данных (AppAuthLink, AppSidebarProfile, login, settings).
   *
   * Эндпоинт публичный: без сессии он отдаёт гостевую форму (`available` с
   * нулевым прогрессом), поэтому запрашиваем его всегда — иначе гость не увидел
   * бы сезонный челлендж на главной.
   */
  const currentState = useAsyncData<CurrentChallenge>(
    'active-challenge',
    async () => {
      if (!auth.isAuthenticated) {
        return await guestCurrent();
      }

      let result: CurrentChallenge;

      try {
        result = await api.request<CurrentChallenge>('/api/challenges/current');
      } catch {
        // Эндпоинт недоступен (старая сборка бэкенда или сбой) — соберём состояние
        // из прежних методов, чтобы главная не осталась без челленджа.
        return await fallbackCurrent();
      }

      if (!result || typeof result.status !== 'string') {
        return await fallbackCurrent();
      }

      // Access-cookie живёт 15 минут, и истёкшая сессия выглядит для публичного
      // эндпоинта как гость: прогресс «пропадает», хотя он есть на сервере.
      // Обновляем токен и спрашиваем заново — один раз.
      if (result.status === 'available' && (result.progress?.done ?? 0) === 0) {
        const retried = await retryAfterRefresh();

        // Токен не обновился или сервер снова ответил гостевой формой: показываем
        // данные как есть. Локальные отметки гостя при этом не трогаем.
        if (retried) {
          return retried;
        }
      }

      return result;
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

  /**
   * Прогресс сезонного челленджа у гостя — считается по локальным отметкам
   * (`summarizeChallengeDays`). У вошедшего прогресс приходит с сервера, поэтому
   * здесь `null`: карточки обоих путей читают одно поле и не дублируют условие.
   */
  const seasonGuestProgress = computed<ChallengeProgress | null>(() => {
    if (auth.isAuthenticated) {
      return null;
    }

    const state = current.value;

    if (!('days' in state) || !state.challenge) {
      return null;
    }

    return guest.guestProgress(state.challenge.slug, state.days ?? []);
  });

  /**
   * Гость завершил сезонный челлендж в этом браузере: он уходит с главной так же,
   * как серверный `completed`. Проверяем только гостя — у вошедшего состоянием
   * владеет сервер, а локальная копия к этому моменту уже перенесена и стёрта.
   */
  const guestCompletedSlug = computed<string | null>(() => {
    if (auth.isAuthenticated) {
      return null;
    }

    const slug = seasonChallenge.value?.slug;

    return slug && guest.isLocallyCompleted(slug) ? slug : null;
  });

  /** Челленджи, которые пользователь не проходит: остальные сезоны и будущие. */
  const available = computed(() =>
    (list.value ?? []).filter(
      (challenge) =>
        challenge.slug !== active.value?.challenge.slug &&
        challenge.slug !== seasonChallenge.value?.slug &&
        challenge.slug !== guestCompletedSlug.value,
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
   *
   * Гость идёт тем же путём, но вместо сервера пишет в localStorage: если запись
   * не удалась (приватный режим), состояние откатывается как при ошибке сети.
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

    if (!auth.isAuthenticated) {
      const slug = host.source === 'current' ? seasonChallenge.value?.slug : active.value?.challenge.slug;

      if (!slug) {
        restore(before);
        return { awarded: [] };
      }

      try {
        guest.toggleGuestTask(slug, task);
      } catch (error) {
        // Хранилище недоступно — состояние челленджа возвращаем как было.
        restore(before);
        throw error;
      }

      return { awarded: [] };
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
   *
   * У гостя сервера нет: отмечаем локально, и карточка уходит с главной так же,
   * как после серверного завершения.
   */
  const finish = async (slug: string) => {
    if (!auth.isAuthenticated) {
      const before = snapshot();
      const state = currentState.data.value;

      if (state?.status === 'completed') {
        return;
      }

      guest.completeGuestChallenge(slug);
      currentState.data.value = {
        status: 'completed',
        season: state?.season ?? null,
        challengeSlug: slug,
        finishedAt: new Date().toISOString(),
        challenge: seasonChallenge.value ?? undefined,
        days: state && 'days' in state ? state.days : undefined,
        progress: state && 'progress' in state ? state.progress : undefined,
      };

      // Запись в localStorage может не пройти (приватный режим) — тогда состояние
      // челленджа возвращаем к снимку, и главная не соврёт.
      if (!guest.isLocallyCompleted(slug)) {
        restore(before);
      }

      return;
    }

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

  /**
   * Гостевой запрос публичного эндпоинта. Если он недоступен (старая сборка
   * бэкенда отвечала 401 гостю), падаем в запасной путь — он умеет собирать
   * состояние из публичного списка челленджей.
   *
   * Объявления ниже — `function`, а не `const`: колбэк `useAsyncData` может
   * выполниться раньше, чем дойдёт очередь до их инициализации.
   */
  async function guestCurrent(): Promise<CurrentChallenge> {
    try {
      return await api.request<CurrentChallenge>('/api/challenges/current');
    } catch {
      return await fallbackCurrent();
    }
  }

  /**
   * Обновление истёкшей сессии и один повторный запрос состояния.
   *
   * Обновляемся через `useApi`, а не сырым `$fetch`: раньше здесь стоял
   * `$fetch('/api/auth/refresh')` с относительным путём, и в SSR он уходил в сам
   * Nitro вместо API — то есть сессия обновлялась только в браузере, а первый
   * серверный рендер показывал гостевой нулевой прогресс. `useApi` подставляет
   * внутренний адрес API и пробрасывает cookie, а CSRF стор берёт из cookie
   * (запрос без него сервер отвергает с 403).
   */
  async function retryAfterRefresh(): Promise<CurrentChallenge | null> {
    let freshToken: string | null;

    try {
      const refreshed = await api.request<{ accessToken?: string }>('/api/auth/refresh', {
        method: 'POST',
      });
      freshToken = refreshed?.accessToken ?? null;
    } catch {
      return null;
    }

    try {
      const retried = !ssrCookie
        ? // В браузере новая cookie уже стоит — обычный путь.
          await api.request<CurrentChallenge>('/api/challenges/current')
        : /**
           * В SSR мы несём cookie входящего запроса, где access-токен ещё старый,
           * а API отдаёт приоритет cookie перед заголовком Authorization. Поэтому
           * подменяем в ней `cp_access` свежим токеном из ответа refresh.
           */
          await $fetch<CurrentChallenge>(`${String(config.apiBase)}/api/challenges/current`, {
            headers: { cookie: freshToken ? mergeAccessCookie(ssrCookie, freshToken) : ssrCookie },
          });

      if (retried?.status === 'available' && (retried.progress?.done ?? 0) === 0) {
        return null;
      }

      return retried ?? null;
    } catch {
      return null;
    }
  }

  return {
    list,
    current,
    active,
    seasonChallenge,
    seasonGuestProgress,
    guestCompletedSlug,
    available,
    refresh,
    /** Прежнее имя метода: страницы вызывали refreshActive после отметок. */
    refreshActive: refresh,
    toggleTask,
    finish,
  };
};
