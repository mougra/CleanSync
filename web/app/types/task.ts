/** Свои задачи: расписания, задачи и ответ `GET /api/tasks/today`. */
import type { TaskFrequency } from '~/types/checklist';

/** Повтор внутри своей задачи: в API есть только эти четыре значения и день в периоде. */
export type TaskRepeatUnit = 'once' | 'day' | 'week' | 'month';

export interface ScheduleSummary {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
}

/** Задача из `GET /api/tasks/today` (колонки таблицы `tasks` как есть). */
export interface TodayPlanTask {
  id: number;
  schedule_id: number;
  title: string;
  frequency: TaskFrequency | null;
  day_of_week: number | null;
  day_of_month: number | null;
  due_date: string | null;
  time: string | null;
  estimated_minutes: number | null;
  room: string | null;
  is_completed: boolean;
  schedule_title: string;
  /**
   * Шаг периодичности из пары «частота + интервал» (миграция 0012): 1 — «каждую
   * неделю», 3 — «раз в 3 недели». Сервер отдаёт колонку как есть (`SELECT t.*`),
   * поэтому подпись в плане дня считается без дополнительных запросов.
   */
  interval_count: number | null;
}

/**
 * Ответ `GET /api/tasks/today`.
 *
 * `tasks` — не список, а словарь «зона → задачи»: сервер группирует пункты по
 * комнате. Это стоит помнить, когда из них собираются чипы на главной.
 */
export interface TodayPlan {
  summary: {
    total_tasks: number;
    completed_tasks: number;
    progress: number;
    total_estimated_time: number;
    remaining_time: number;
  };
  tasks: Record<string, TodayPlanTask[]>;
}

/** Периодичность в терминах API: частота плюс интервал «раз в N». */
export interface TaskRepeat {
  frequency: TaskFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
}

/** Тело `POST /api/tasks`. */
export interface TaskCreateInput extends TaskRepeat {
  schedule_id: number;
  title: string;
  room: string | null;
  due_date: string | null;
  estimated_minutes: number;
  /** Счётчик «раз в N дней/недель/месяцев» (миграция 0012, CHECK >= 1). */
  interval_count?: number;
}

/**
 * Задача в ответе календаря: `GET /api/tasks/calendar`.
 *
 * Полей меньше, чем в `TodayPlanTask`: календарю и шторке дня нужны только
 * название, зона, минуты, отметка и подпись периодичности. Всё остальное в
 * панели дня всё равно не поместилось бы.
 */
export interface CalendarTask {
  id: number;
  title: string;
  room: string | null;
  estimated_minutes: number | null;
  is_completed: boolean;
  frequency: TaskFrequency | null;
  /** Шаг периодичности из пары «частота + интервал»: 3 — «раз в 3 недели». */
  interval_count: number | null;
}

/** Один день календаря: дата, день недели, итоги и краткий список задач. */
export interface CalendarDay {
  date: string;
  /** 0-6, 0 — воскресенье (как `day_of_week` в API). */
  weekday: number;
  total_tasks: number;
  /** Сколько задач дня уже закрыто: по этому числу шторка показывает сводку. */
  completed_tasks: number;
  total_minutes: number;
  /** Минуты по факту — сумма оценки закрытых задач дня. */
  completed_minutes: number;
  tasks: CalendarTask[];
}

/** Ответ `GET /api/tasks/calendar?from=…&to=…`: границы диапазона и дни по порядку. */
export interface CalendarResponse {
  from: string;
  to: string;
  days: CalendarDay[];
}
