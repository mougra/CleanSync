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
