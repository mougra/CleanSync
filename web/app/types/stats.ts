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
  totals: { tasks: number; minutes: number; days: number };
  last7: { tasks: number; minutes: number };
  weekday: StatsWeekday[];
  busiestWeekday: number | null;
  longest: { title: string; minutes: number; date: string } | null;
  history: StatsHistoryItem[];
}
