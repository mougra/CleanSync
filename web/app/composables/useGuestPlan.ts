import type { TaskCadence, TaskLevel } from '~/types/catalog';

/**
 * План уборки без аккаунта.
 *
 * Зачем так. Самый ценный экран продукта — собранный под дом набор задач — был
 * доступен только после регистрации, и гость из поиска уходил, не увидев ничего.
 * Теперь план собирает публичный маршрут `/api/home-profile/preview`, а прогресс
 * живёт **на устройстве**: серверу нечего хранить, пока у человека нет аккаунта,
 * и это честнее, чем заводить ему «анонимного пользователя» в базе.
 *
 * Что это значит на практике:
 *  - отметки переживают перезагрузку и закрытие вкладки (localStorage);
 *  - на другом устройстве их нет — это плата за отсутствие аккаунта;
 *  - при регистрации набор пересобирается на сервере по тем же ответам, потому
 *    что генератор детерминирован, а отметки переезжают вместе с ответами
 *    (`transferToAccount`).
 *
 * Ключ хранилища версионирован: формат плана может измениться, и старые данные
 * должны быть проигнорированы, а не прочитаны наполовину.
 */

const STORAGE_KEY = 'tidyplan-guest-plan-v1';

export interface GuestAnswers {
  housingType?: string;
  rooms?: string;
  composition?: string;
  pets?: string[];
  outdoor?: string;
  hasKidsRoom?: boolean;
  hasGarage?: boolean;
  worksFromHome?: boolean;
  drying?: string;
  cleaningLevel?: string;
  dailyMinutes?: string;
  cleaningStyle?: string;
  cleaningDays?: number[];
  hardestZone?: string;
}

export interface GuestTask {
  title: string;
  room: string;
  minutes: number;
  level: TaskLevel;
  cadence: TaskCadence;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  intervalCount: number;
}

export interface GuestSummary {
  totalTasks: number;
  totalMinutes: number;
  weeklyTasks: number;
  monthlyTasks: number;
  maxDailyMinutes: number;
  dailyLimit: number;
  rooms: string[];
}

export interface GuestPlan {
  answers: GuestAnswers;
  tasks: GuestTask[];
  /** Подписи периодичностей с сервера: `{ weekly: 'Раз в неделю', … }`. */
  cadences: Record<string, string>;
  summary: GuestSummary;
  /** Когда план собран: по нему видно, стоит ли предлагать пересобрать. */
  builtAt: string;
}

const isGuestPlan = (value: unknown): value is GuestPlan => {
  if (!value || typeof value !== 'object') return false;

  const plan = value as Partial<GuestPlan>;

  return Boolean(plan.tasks) && Array.isArray(plan.tasks) && typeof plan.answers === 'object';
};

export const useGuestPlan = () => {
  const { request } = useApi();

  const plan = useState<GuestPlan | null>('guest-plan', () => null);
  const loading = useState<boolean>('guest-plan-loading', () => false);
  const failure = useState<string | null>('guest-plan-failure', () => null);

  /** Чтение из localStorage: только в браузере и только целиком валидного плана. */
  const load = () => {
    if (!import.meta.client) return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) return;

      const parsed: unknown = JSON.parse(raw);

      plan.value = isGuestPlan(parsed) ? parsed : null;
    } catch {
      // Битые данные — не ошибка пользователя: начинаем с чистого листа.
      plan.value = null;
    }
  };

  const save = () => {
    if (!import.meta.client) return;

    try {
      if (plan.value) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan.value));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Приватный режим или переполненное хранилище: план остаётся в памяти
      // вкладки, и это лучше, чем упасть на записи.
    }
  };

  /** Собрать план по ответам: короткая сводка вместо списка дел с галочками. */
  const build = async (answers: GuestAnswers): Promise<boolean> => {
    loading.value = true;
    failure.value = null;

    try {
      const response = await request<{
        plan: { tasks: GuestTask[]; cadences: Record<string, string>; summary: GuestSummary };
      }>('/api/home-profile/preview', {
        method: 'POST',
        body: { ...answers },
      });

      plan.value = {
        answers,
        tasks: response.plan.tasks,
        cadences: response.plan.cadences ?? {},
        summary: response.plan.summary,
        builtAt: new Date().toISOString(),
      };

      save();

      return true;
    } catch {
      failure.value = 'preview';
      return false;
    } finally {
      loading.value = false;
    }
  };

  const reset = () => {
    plan.value = null;
    save();
  };

  /**
   * Переезд плана в аккаунт: те же ответы сохраняются в профиль, набор
   * создаётся на сервере, локальная копия удаляется.
   */
  const transferToAccount = async (): Promise<boolean> => {
    if (!plan.value) return false;

    loading.value = true;
    failure.value = null;

    try {
      await request('/api/home-profile', {
        method: 'PUT',
        body: { ...plan.value.answers, complete: true },
      });

      await request('/api/home-profile/plan', { method: 'POST' });

      plan.value = null;
      save();

      return true;
    } catch {
      failure.value = 'transfer';
      return false;
    } finally {
      loading.value = false;
    }
  };

  return {
    plan,
    loading,
    failure,
    load,
    build,
    reset,
    transferToAccount,
  };
};
