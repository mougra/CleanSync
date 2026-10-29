/**
 * Гостевые отметки: прогресс в браузере до регистрации.
 *
 * Гость видит базовый план, но сохранять его некуда — аккаунта нет. Чтобы план
 * не был «мёртвой картинкой», отметки живут в localStorage по дате и названию
 * дела. Название, а не id: у гостя задач в базе нет, а при регистрации набор
 * создаётся с теми же названиями, по ним и переносим.
 *
 * После регистрации `transfer()` находит задачи по названиям в «Моих задачах» и
 * ставит отметки через обычный `PUT /api/tasks/:id` с нужной датой. Перенос
 * идёт один раз: localStorage очищается только после успешного прохода.
 */
const STORAGE_KEY = 'tidyplan-guest-marks';

type MarksByDate = Record<string, Record<string, true>>;

export const useGuestMarks = () => {
  const marks = useState<MarksByDate>('guest-marks', () => ({}));
  const loaded = useState<boolean>('guest-marks-loaded', () => false);
  const pending = useState<boolean>('guest-marks-pending', () => false);

  const ensureLoaded = (): void => {
    if (loaded.value || !import.meta.client) {
      return;
    }

    loaded.value = true;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;

      if (parsed && typeof parsed === 'object') {
        marks.value = parsed as MarksByDate;
      }
    } catch {
      // Битое значение в хранилище — не повод ломать страницу: начинаем с нуля.
      marks.value = {};
    }
  };

  const persist = (): void => {
    if (!import.meta.client) {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(marks.value));
    } catch {
      // Приватный режим и переполнение хранилища: отметки просто не сохранятся.
    }
  };

  const isMarked = (date: string, title: string): boolean => {
    ensureLoaded();

    return marks.value[date]?.[title] === true;
  };

  const toggle = (date: string, title: string): void => {
    ensureLoaded();

    const current = marks.value[date] ?? {};
    const day: Record<string, true> = {};

    for (const [key, value] of Object.entries(current)) {
      if (key !== title) {
        day[key] = value;
      }
    }

    if (!current[title]) {
      day[title] = true;
    }

    marks.value = { ...marks.value, [date]: day };
    persist();
  };

  /** Сколько отметок стоит на дату — для кольца и сводки гостевого плана. */
  const countFor = (date: string): number => {
    ensureLoaded();

    return Object.keys(marks.value[date] ?? {}).length;
  };

  const entries = (): { date: string; title: string }[] => {
    ensureLoaded();

    return Object.entries(marks.value).flatMap(([date, titles]) =>
      Object.keys(titles).map((title) => ({ date, title })),
    );
  };

  const clear = (): void => {
    marks.value = {};
    loaded.value = true;

    if (import.meta.client) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Нечего очищать — и хорошо.
      }
    }
  };

  /**
   * Перенос гостевых отметок в аккаунт. Возвращает число перенесённых дел.
   *
   * Названия берутся из `/api/tasks/mine`: он же создаёт набор новому аккаунту
   * (`ensureDefaultSet`), поэтому к моменту переноса задачи уже существуют.
   */
  const transfer = async (): Promise<number> => {
    if (!import.meta.client) {
      return 0;
    }

    ensureLoaded();

    const list = entries();

    if (list.length === 0) {
      return 0;
    }

    pending.value = true;

    try {
      const api = useApi();
      const response = await api.request<{ tasks: { id: number; title: string }[] }>(
        '/api/tasks/mine',
      );
      const byTitle = new Map(response.tasks.map((task) => [task.title, task.id]));
      let moved = 0;

      for (const { date, title } of list) {
        const id = byTitle.get(title);

        if (id === undefined || id <= 0) {
          continue;
        }

        try {
          await api.request(`/api/tasks/${id}`, {
            method: 'PUT',
            body: { is_completed: true, completed_on: date },
          });
          moved += 1;
        } catch {
          // Одно дело не перенеслось — остальные всё равно пробуем.
        }
      }

      clear();

      return moved;
    } finally {
      pending.value = false;
    }
  };

  return { marks, isMarked, toggle, countFor, entries, clear, transfer, pending };
};
