export interface User {
  id: string;
  email: string;
  username?: string | null;
  avatar_url?: string | null;
  is_email_confirmed?: boolean;
  created_at?: string;
}

export interface Task {
  id: string;
  schedule_id: string;
  title: string;
  frequency: 'daily' | 'weekly' | 'monthly' | string | null;
  day_of_week: number | null;
  day_of_month?: number | null;
  due_date?: string | null;
  time: string | null;
  estimated_minutes?: number;
  room?: string | null;
  is_completed: boolean;
  completed_at?: string | null;
  created_at?: string;
}

export interface Schedule {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  is_template?: boolean;
  is_seasonal?: boolean;
  created_at?: string;
  tasks?: Task[];
}
