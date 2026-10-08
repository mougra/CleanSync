export interface ChecklistTemplate {
  id: number;
  title: string;
  description: string | null;
  items_count: number;
}

export interface ChecklistSummary {
  id: number;
  title: string;
  description: string | null;
  source_template_id: number | null;
  created_at: string;
  total: number;
  done: number;
}

export interface ChecklistItem {
  id: number;
  text: string;
  room: string | null;
  estimated_minutes: number | null;
  done: boolean;
}

export interface ChecklistDetail extends ChecklistSummary {
  items: ChecklistItem[];
}

/** Свой список без шаблона — расписание из фичи «свои задачи». */
export interface OwnSchedule {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
}

export type TaskFrequency = 'once' | 'daily' | 'weekly' | 'monthly';
