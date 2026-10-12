import type { DeleteTaskResponse, DeletedTaskPayload, RestoreTaskResponse } from '~/types/task';

/**
 * Уведомление «Задача удалена» с кнопкой «Вернуть».
 *
 * Удаление и возврат — одно действие с точки зрения человека, поэтому они живут
 * в одном месте: страница плана просит удалить, раскладка (`FloatingNotifications`)
 * показывает уведомление, и оба работают с общим состоянием. Второй копии
 * «что сейчас можно вернуть» быть не должно — иначе кнопка в уведомлении и
 * задача, которую она возвращает, разошлись бы.
 *
 * Данные приходят из ответа `DELETE /api/tasks/:id` полем `task`: сервер отдаёт
 * копию удалённой задачи, и ровно она уходит обратно в `POST /api/tasks/restore`.
 * Дополнительных запросов на удаление не нужно.
 */

/** Сколько живёт кнопка «Вернуть»: семь секунд — успеть прочитать и решить. */
export const TASK_UNDO_MS = 7000;

/** Что именно можно вернуть: копия задачи и её прежний id. */
export interface PendingUndo {
  id: number;
  task: DeletedTaskPayload;
}

/**
 * Ключи данных, которые обновляются после удаления и после возврата.
 *
 * Тот же список, что при отметке задачи: удалённая строка меняет и план дня, и
 * открытый день календаря, и серию, и прогресс достижений.
 */
const AFFECTED_KEYS = ['today-plan', 'calendar-day', 'streak', 'achievements-progress'];

export const useTaskUndo = () => {
  const api = useApi();
  const { t } = useI18n();

  /** Ждёт возврата одна задача: два уведомления на экране спорили бы за место. */
  const pending = useState<PendingUndo | null>('task-undo-pending', () => null);
  /** Идёт запрос удаления: повторное нажатие в листе не проходит. */
  const removing = useState<boolean>('task-undo-removing', () => false);
  /** Идёт запрос возврата. */
  const restoring = useState<boolean>('task-undo-restoring', () => false);
  /** Понятная строка ошибки вместо молчаливого отказа. */
  const error = useState<string>('task-undo-error', () => '');

  const clear = () => {
    pending.value = null;
    error.value = '';
  };

  /**
   * Удалить задачу и запомнить её для возврата.
   *
   * Успех определяется ответом сервера, а не фактом запроса: если сервер не
   * подтвердил удаление, лист действий не закрывается и строка остаётся на месте.
   * Пустая ошибка — признак успеха, потому что текст уже переведён здесь: i18n
   * доступен только внутри запроса с контекстом, а не в шаблоне другого компонента.
   */
  const remove = async (id: number): Promise<boolean> => {
    if (removing.value) {
      return false;
    }

    removing.value = true;
    error.value = '';

    try {
      const response = await api.request<DeleteTaskResponse>(`/api/tasks/${id}`, {
        method: 'DELETE',
      });

      if (!response?.deleted) {
        error.value = t('plan.deleteFailed');
        return false;
      }

      pending.value = { id, task: response.task };
      await refreshNuxtData(AFFECTED_KEYS);
      return true;
    } catch {
      error.value = t('plan.deleteFailed');
      return false;
    } finally {
      removing.value = false;
    }
  };

  /**
   * Вернуть удалённую задачу на место.
   *
   * Тело — сохранённая копия задачи: сервер вставит её в то же расписание и, если
   * задача была сгенерированной, снимет пометку отказа (иначе пересборка плана
   * снова её бы пропустила). Ошибка не смахивает уведомление: человек может
   * попробовать ещё раз, пока оно на экране.
   */
  const restore = async (): Promise<boolean> => {
    const current = pending.value;

    if (!current || restoring.value) {
      return false;
    }

    restoring.value = true;
    error.value = '';

    try {
      await api.request<RestoreTaskResponse>('/api/tasks/restore', {
        method: 'POST',
        body: current.task,
      });

      pending.value = null;
      await refreshNuxtData(AFFECTED_KEYS);
      return true;
    } catch {
      error.value = t('plan.restoreFailed');
      return false;
    } finally {
      restoring.value = false;
    }
  };

  /** Закрыть уведомление без возврата: задача остаётся удалённой. */
  const dismiss = () => {
    pending.value = null;
    error.value = '';
  };

  return { pending, removing, restoring, error, remove, restore, dismiss, clear };
};
