/**
 * Анкета о доме из мастера «Настройка по дому».
 *
 * Ключи — camelCase, как их отдаёт API (`/api/home-profile`): в базе колонки
 * snake_case, но наружу сервер приводит их к одному виду. Значения — короткие
 * латинские коды, подписи живут в i18n: перевод не зависит от данных.
 */
export interface HomeProfile {
  housingType: string | null;
  rooms: string | null;
  composition: string | null;
  pets: string[];
  outdoor: string | null;
  hasKidsRoom: boolean | null;
  hasGarage: boolean | null;
  worksFromHome: boolean | null;
  drying: string | null;
  cleaningLevel: string | null;
  dailyMinutes: string | null;
  cleaningStyle: string | null;
  cleaningDays: number[];
  hardestZone: string | null;
  completedAt: string | null;
  updatedAt?: string | null;
}

export interface PlannedTaskView {
  id: number | null;
  position: number;
  title: string;
  room: string;
  estimatedMinutes: number;
}

export interface PlannedDayView {
  /** 0 — воскресенье, 1 — понедельник … 6 — суббота (как `tasks.day_of_week`). */
  dayOfWeek: number;
  label: string;
  selected: boolean;
  totalTasks: number;
  totalMinutes: number;
  tasks: PlannedTaskView[];
}

export interface HomePlan {
  schedule: { id: number; title: string; createdAt: string };
  level: string;
  focusZone: string | null;
  days: PlannedDayView[];
  summary: {
    totalTasks: number;
    totalMinutes: number;
    activeDays: number;
    minutesPerDay: number;
    dailyBudget: number;
    rooms: string[];
    tags: string[];
    notes: string[];
  };
}
