export type StatsPeriod = 'week' | 'month' | 'all';

export interface StatsWeekday {
  weekday: number;
  tasks: number;
  minutes: number;
}

export interface StatsHistoryItem {
  title: string;
  date: string;
  minutes: number;
  room: string | null;
  kind: 'task' | 'challenge';
}

export interface StatsOverview {
  period: StatsPeriod;
  /** `timer_minutes` — факт по таймеру, отдельно от оценки `minutes`. */
  totals: { tasks: number; minutes: number; days: number; timer_minutes: number };
  last7: { tasks: number; minutes: number; timer_minutes: number };
  weekday: StatsWeekday[];
  busiestWeekday: number | null;
  longest: { title: string; minutes: number; date: string } | null;
  history: StatsHistoryItem[];
}
