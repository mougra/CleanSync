/**
 * Локальный прогресс челленджей у гостя.
 *
 * Челленджи открыты всем, но у незарегистрированного человека нет записи на
 * сервере, поэтому его отметки живут в браузере: ключ `tidyplan-challenge-progress`
 * и объект по слагу челленджа. Когда человек входит или регистрируется,
 * накопленное уходит на сервер (`POST /api/challenges/:slug/sync`), а локальная
 * копия стирается — см. `composables/useGuestChallenge.ts`.
 *
 * В localStorage может лежать что угодно (его правят руками, туда пишут старые
 * версии приложения), поэтому чтение всегда валидирует форму и молча отдаёт
 * пустой объект вместо исключения.
 */

export const GUEST_CHALLENGE_STORAGE_KEY = 'tidyplan-challenge-progress';

/** Отметки одного челленджа: что отмечено и не завершён ли он локально. */
export interface GuestChallengeEntry {
  /** Идентификаторы отмеченных задач (`challenge_tasks.id`). */
  taskIds: number[];
  /** Челлендж завершён гостем: на главной он больше не показывается. */
  completed?: boolean;
  /** Момент последнего изменения — ISO-строка, как `finishedAt` у сервера. */
  updatedAt: string;
}

export type GuestChallengeStore = Record<string, GuestChallengeEntry>;

/** Ссылка на localStorage: на сервере его нет, и это не ошибка. */
function storage(): Storage | null {
  if (!import.meta.client) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    // Приватный режим или запрет хранилища: работаем без отметок.
    return null;
  }
}

function normalizeEntry(value: unknown): GuestChallengeEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<GuestChallengeEntry>;
  const taskIds = Array.isArray(raw.taskIds)
    ? raw.taskIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  return {
    // Дубли в массиве не нужны: отметка бинарная, а на сервер уходит список id.
    taskIds: [...new Set(taskIds)],
    completed: raw.completed === true,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  };
}

/** Прочитать все локальные отметки. Пустой объект — штатный ответ. */
export function readGuestChallengeProgress(): GuestChallengeStore {
  const store = storage();

  if (!store) {
    return {};
  }

  try {
    const raw = store.getItem(GUEST_CHALLENGE_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: GuestChallengeStore = {};

    for (const [slug, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = normalizeEntry(value);

      if (entry && (entry.taskIds.length > 0 || entry.completed)) {
        result[slug] = entry;
      }
    }

    return result;
  } catch {
    return {};
  }
}

/** Записать весь объект отметок. Пустой объект удаляет ключ из хранилища. */
export function writeGuestChallengeProgress(progress: GuestChallengeStore): void {
  const store = storage();

  if (!store) {
    return;
  }

  try {
    if (Object.keys(progress).length === 0) {
      store.removeItem(GUEST_CHALLENGE_STORAGE_KEY);
      return;
    }

    store.setItem(GUEST_CHALLENGE_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Переполнение квоты или запрет записи: отметка не сохранилась, но
    // приложение продолжает работать — прогресс придёт с сервера после входа.
  }
}

/** Отметки одного челленджа; `null`, если гость его ещё не трогал. */
export function readGuestChallengeEntry(slug: string): GuestChallengeEntry | null {
  return readGuestChallengeProgress()[slug] ?? null;
}
