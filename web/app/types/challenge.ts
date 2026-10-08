export interface ChallengeSummary {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  season: string | null;
  days_count: number;
  tasks_count: number;
  cover_url: string | null;
}

export interface ChallengeTask {
  id: number;
  position?: number;
  title: string;
  hint: string | null;
  room: string | null;
  estimated_minutes: number;
  /** once | daily | every2days | weekly */
  frequency: string;
  is_done: boolean;
}

export interface ChallengeDay {
  id: number;
  day_number: number;
  title: string;
  subtitle?: string | null;
  tasks: ChallengeTask[];
}

export interface ChallengeProgress {
  done: number;
  total: number;
  percent: number;
  minutesLeft: number;
  currentDay: number | null;
}

export interface ActiveChallenge {
  userChallengeId: number;
  challenge: ChallengeSummary;
  progress: ChallengeProgress;
  days: ChallengeDay[];
}

export interface ActiveChallengeResponse {
  active: ActiveChallenge | null;
}

export interface ChallengeDetail {
  challenge: ChallengeSummary;
  progress: ChallengeProgress;
  days: ChallengeDay[];
}
