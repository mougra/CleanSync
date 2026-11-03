import type { FocusSession } from '~/types/task';

/**
 * Таймер уборки на клиенте.
 *
 * Сервер — источник правды (он же считает секунды и пишет факт), но ticking раз в
 * секунду по HTTP не нужен: между ответами клиент сам прибавляет время, а сервер
 * пересчитывает его при каждом действии. Так батарея и сеть не страдают, а
 * расхождение не выходит за пару секунд.
 *
 * Состояние живёт в общем ключе (`useState`), потому что на таймер смотрят два
 * места: панель плана и значок в шапке дня. Активная сессия запоминается и в
 * `localStorage`: перезагрузка страницы не должна «терять» идущий таймер — после
 * монтирования мы спросим сервер и покажем то же время.
 */
const STORAGE_KEY = 'tidyplan-focus-session';

export const useFocusTimer = () => {
  const api = useApi();
  const session = useState<FocusSession | null>('focus-session', () => null);
  /** Сколько секунд показывать: серверное значение плюс тиканье на клиенте. */
  const seconds = useState<number>('focus-seconds', () => 0);
  const pending = useState<boolean>('focus-pending', () => false);
  const loaded = useState<boolean>('focus-loaded', () => false);

  let ticker: ReturnType<typeof setInterval> | null = null;

  const stopTicker = () => {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };

  const startTicker = () => {
    stopTicker();

    ticker = setInterval(() => {
      if (session.value?.status === 'running') {
        seconds.value += 1;
      }
    }, 1000);
  };

  const apply = (next: FocusSession | null) => {
    session.value = next;
    seconds.value = next?.seconds ?? 0;

    if (typeof localStorage !== 'undefined') {
      if (next) {
        localStorage.setItem(STORAGE_KEY, String(next.id));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    if (next?.status === 'running') {
      startTicker();
    } else {
      stopTicker();
    }
  };

  /** Перечитать активную сессию: на монтировании и после возврата на вкладку. */
  const load = async () => {
    try {
      const response = await api.request<{ session: FocusSession | null }>('/api/timer/active');
      apply(response.session ?? null);
    } catch {
      apply(null);
    } finally {
      loaded.value = true;
    }
  };

  const start = async (taskId?: number) => {
    if (pending.value) return;
    pending.value = true;

    try {
      const response = await api.request<{ session: FocusSession }>('/api/timer/start', {
        method: 'POST',
        body: taskId ? { taskId } : {},
      });
      apply(response.session);
    } finally {
      pending.value = false;
    }
  };

  const pause = async () => {
    if (pending.value) return;
    pending.value = true;

    try {
      const response = await api.request<{ session: FocusSession }>('/api/timer/pause', {
        method: 'POST',
      });
      apply(response.session);
    } finally {
      pending.value = false;
    }
  };

  const resume = async () => {
    if (pending.value) return;
    pending.value = true;

    try {
      const response = await api.request<{ session: FocusSession }>('/api/timer/resume', {
        method: 'POST',
      });
      apply(response.session);
    } finally {
      pending.value = false;
    }
  };

  /** Завершение: возвращает записанные минуты, чтобы показать короткую строку. */
  const finish = async (): Promise<number> => {
    if (pending.value) return 0;
    pending.value = true;

    try {
      const response = await api.request<{ minutes: number }>('/api/timer/finish', {
        method: 'POST',
      });
      apply(null);

      return response.minutes ?? 0;
    } finally {
      pending.value = false;
    }
  };

  return { session, seconds, pending, loaded, load, start, pause, resume, finish };
};
