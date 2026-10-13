export interface StreakWeekDay {
  date: string;
  active: boolean;
  isToday: boolean;
}

export interface StreakState {
  today: string;
  current: number;
  best: number;
  todayDone: boolean;
  lastActiveOn: string | null;
  freezesAvailable: number;
  freezesUsedTotal: number;
  /** Режим отпуска: включён ли и с какого дня начат. */
  vacation: {
    active: boolean;
    startedOn: string | null;
  };
  week: {
    start: string;
    days: StreakWeekDay[];
    activeDays: number;
    target: number;
    met: boolean;
  };
}
