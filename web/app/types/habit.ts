export type HabitIntervalUnit = 'once' | 'day' | 'week' | 'month';

export interface HabitTemplate {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  icon: string | null;
  interval_count: number;
  interval_unit: HabitIntervalUnit;
  zone: string | null;
}

export interface Habit {
  id: number;
  title: string;
  zone: string | null;
  icon: string;
  category: string | null;
  intervalCount: number;
  intervalUnit: HabitIntervalUnit;
  dueDate: string | null;
  reminderEnabled: boolean;
  isCustom: boolean;
  doneToday: boolean;
  isDue: boolean;
  lastCompletedOn: string | null;
  streak: number;
}

export interface HabitsResponse {
  today: string;
  habits: Habit[];
  dueToday: number;
}

export interface HabitCategoryCount {
  category: string;
  total: number;
}
