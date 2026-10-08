export interface ActivityDay {
  date: string;
  tasks: number;
  challenge_tasks: number;
  habit_checkins: number;
  minutes: number;
}

export interface AnalyticsTotals {
  ownTasks: number;
  challengeTasks: number;
  habitCheckins: number;
  activeHabits: number;
  minutes: number;
}

export interface AnalyticsRoom {
  room: string;
  done: number;
}

export interface AnalyticsHabit {
  title: string;
  icon: string | null;
  done: number;
}

export interface AnalyticsSummary {
  activity: ActivityDay[];
  totals: AnalyticsTotals;
  rooms: AnalyticsRoom[];
  habits: AnalyticsHabit[];
}
