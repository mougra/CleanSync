export interface Achievement {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  criteria_type: string;
  criteria_value: number;
  earned_at?: string | null;
}

export interface AchievementProgress extends Achievement {
  current: number;
  earned: boolean;
}

export interface AchievementsProgressResponse {
  earned: number;
  total: number;
  achievements: AchievementProgress[];
}
