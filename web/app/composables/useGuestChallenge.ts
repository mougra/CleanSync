import type {
  ChallengeDay,
  ChallengeProgress,
  ChallengeTask,
  ChallengeTaskToggleResponse,
} from '~/types/challenge';
import {
  readGuestChallengeProgress,
  writeGuestChallengeProgress,
  type GuestChallengeEntry,
  type GuestChallengeStore,
} from '~/utils/guestChallenge';

/**
 * Гостевой путь челленджей.
 *
 * Челлендж открыт всем: незарегистрированный человек отмечает задачи в один тап,
 * а отметки живут в `localStorage` браузера (структура — в `utils/guestChallenge.ts`).
 * Сервер про гостя ничего не знает, поэтому:
 *
 * - состояние читается лениво (`hydrate()` в `onMounted`), иначе разметка сервера
 *   и клиента разойдутся: на SSR localStorage недоступен, и «отмечено» появилось бы
 *   только в браузере;
 * - оптимистичность и откат делает `useChallenges`, а здесь только хранилище;
 * - после входа или регистрации накопленное уходит на сервер через
 *   `POST /api/challenges/:slug/sync`, и только после успеха локальная копия
 *   стирается: ошибка сети не должна стоить человеку прогресса.
 */
export const useGuestChallenge = () => {
  const auth = useAuthStore();
  const api = useApi();

  /**
   * Состояние общее на приложение: `useState` переживает переходы между
   * страницами, а ключ с префиксом `guest:` гарантирует, что Nuxt не тронет
   * его в payload и не перенесёт гостевые отметки между людьми.
   */
  const progress = useState<GuestChallengeStore>('guest:challenge-progress', () => ({}));

  /** Отметки загружены из браузера: до этого показываем пустое состояние SSR. */
  const ready = useState<boolean>('guest:challenge-ready', () => false);

  const hydrate = () => {
    if (!import.meta.client || ready.value) {
      return;
    }

    progress.value = readGuestChallengeProgress();
    ready.value = true;
  };

  /**
   * Явная инициализация: читает localStorage и запоминает, что отметки загружены.
   * Нужна тому, кто вызывает composable вне компонента — плагину
   * `guest-challenge.client.ts`. Повторные вызовы ничего не делают (`ready`),
   * на сервере тоже (localStorage там нет).
   */
  const initGuestProgress = () => {
    hydrate();
  };

  /*
   * Компонент может вызвать composable и не позаботиться о гидратации: читаем
   * хранилище сами. Именно `onMounted`, а не сразу в setup: первый рендер в
   * браузере обязан совпасть с серверной разметкой, где отметок гостя ещё нет
   * (иначе — тот же hydration mismatch, только на страницах челленджей).
   *
   * Вне компонента (в плагине) инстанса нет, `onMounted` вызвал бы
   * предупреждение Vue и потерялся бы — там инициализацию запускает
   * `initGuestProgress()` явно, хук `app:mounted` (см. плагин).
   */
  if (getCurrentInstance()) {
    onMounted(initGuestProgress);
  }

  const persist = (next: GuestChallengeStore) => {
    progress.value = next;
    writeGuestChallengeProgress(next);
  };

  const entryOf = (slug: string): GuestChallengeEntry | null => progress.value[slug] ?? null;

  const taskIdsOf = (slug: string): number[] => entryOf(slug)?.taskIds ?? [];

  /**
   * Отметка или снятие отметки. Возвращает новое состояние задачи, чтобы
   * вызывающая страница могла откатить его, если запись в хранилище не удалась.
   */
  const toggleGuestTask = (slug: string, task: ChallengeTask): boolean => {
    hydrate();

    const entry = entryOf(slug);
    const now = new Date().toISOString();
    const ids = new Set(entry?.taskIds ?? []);

    if (ids.has(task.id)) {
      ids.delete(task.id);
    } else {
      ids.add(task.id);
    }

    persist({
      ...progress.value,
      [slug]: {
        ...entry,
        taskIds: [...ids],
        // Снятая галочка снова делает челлендж незавершённым: иначе он пропал бы
        // с главной, хотя человек только что вернулся к работе.
        completed: ids.size > 0 ? (entry?.completed ?? false) : false,
        updatedAt: now,
      },
    });

    return ids.has(task.id);
  };

  /**
   * Челлендж завершён именно в этом браузере. У вошедшего состояние приходит
   * с сервера, поэтому проверку применяем только к гостю.
   */
  const isLocallyCompleted = (slug: string): boolean => entryOf(slug)?.completed === true;

  /**
   * Отметить завершение локально, минуя сервер: так заканчивают челлендж гости.
   * Возвращает `true`, если запись действительно сохранилась в браузере —
   * вызывающая сторона по этому признаку решает, показывать ли «завершён».
   */
  const completeGuestChallenge = (slug: string): boolean => {
    hydrate();

    const entry = entryOf(slug);

    persist({
      ...progress.value,
      [slug]: {
        taskIds: entry?.taskIds ?? [],
        completed: true,
        updatedAt: new Date().toISOString(),
      },
    });

    return isLocallyCompleted(slug);
  };

  /** Дни публичного челленджа с отметками гостя — подпись для карточки. */
  const withGuestMarks = (slug: string, days: ChallengeDay[]): ChallengeDay[] => {
    const done = new Set(taskIdsOf(slug));

    if (done.size === 0) {
      return days;
    }

    return days.map((day) => ({
      ...day,
      tasks: day.tasks.map((task) => (done.has(task.id) ? { ...task, is_done: true } : task)),
    }));
  };

  /**
   * Пересчёт прогресса гостя — тем же помощником, что и на сервере
   * (`utils/challenge.ts`): расчёт обязан совпадать с авторизованным путём.
   */
  const guestProgress = (slug: string, days: ChallengeDay[]): ChallengeProgress =>
    summarizeChallengeDays(withGuestMarks(slug, days));

  /**
   * Забыть локальную копию челленджа. Нужна после успешного переноса в аккаунт:
   * сервер теперь знает про отметки, и второй копии быть не должно.
   */
  const clear = (slug: string) => {
    persist(
      Object.fromEntries(Object.entries(progress.value).filter(([key]) => key !== slug)),
    );
  };

  /** Синхронизация уже идёт: повторный вызов из watcher не нужен. */
  let syncing = false;

  /**
   * Перенос локальных отметок в аккаунт. Вызывается, когда появилась сессия
   * (вход или успешная регистрация). Возвращает число перенесённых челленджей.
   *
   * Порядок важен: сначала успешный ответ сервера, потом удаление локальной
   * копии. Если запрос упал — молча пишем в консоль и оставляем отметки, чтобы
   * человек не потерял прогресс и не увидел пугающую ошибку.
   */
  const syncGuestProgress = async (): Promise<number> => {
    hydrate();

    if (syncing || !auth.isAuthenticated) {
      return 0;
    }

    const pending = Object.entries(progress.value).filter(([, entry]) => entry.taskIds.length > 0);

    if (pending.length === 0) {
      return 0;
    }

    syncing = true;
    let synced = 0;

    try {
      for (const [slug, entry] of pending) {
        try {
          await api.request<ChallengeTaskToggleResponse>(`/api/challenges/${slug}/sync`, {
            method: 'POST',
            body: { taskIds: entry.taskIds },
          });

          clear(slug);
          synced += 1;
        } catch (error) {
          // Сервер не принял (старый бэкенд, чужая сессия, сеть) — отметки
          // остаются в браузере и переносятся при следующем входе.
          console.warn('[challenge] не удалось перенести локальные отметки', slug, error);
        }
      }
    } finally {
      syncing = false;
    }

    if (synced > 0) {
      // Состояние челленджей перечитываем теми же ключами, что использует
      // useChallenges: иначе на главной остался бы прежний пустой прогресс.
      await refreshNuxtData(['active-challenge', 'challenges-active']);
    }

    return synced;
  };

  return {
    guestProgressState: progress,
    hydrateGuestProgress: hydrate,
    initGuestProgress,
    taskIdsOf,
    toggleGuestTask,
    completeGuestChallenge,
    isLocallyCompleted,
    withGuestMarks,
    guestProgress,
    syncGuestProgress,
    clearGuestProgress: clear,
  };
};
