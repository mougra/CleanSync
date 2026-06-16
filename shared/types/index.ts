export interface User {
  id: string;
  email: string;
  created_at?: string;
}

export interface Task {
  id: string;
  schedule_id: string;
  title: string;
  frequency: 'daily' | 'weekly' | 'monthly' | string | null;
  day_of_week: number | null;
  time: string | null;
  is_completed: boolean;
  created_at?: string;
}

export interface Schedule {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at?: string;
  tasks?: Task[];
}
