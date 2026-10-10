export interface HouseholdInfo {
  id: number;
  name: string;
  ownerId: number;
  inviteCode: string;
}

export interface HouseholdMember {
  id: number;
  email: string;
  username: string | null;
  role: 'owner' | 'member';
  joined_at: string;
  week_done: number;
  today_done: number;
  open_assigned: number;
}

export interface HouseholdTask {
  id: number;
  schedule_id: number;
  title: string;
  room: string | null;
  estimated_minutes: number | null;
  is_completed: boolean;
  assignee_id: number | null;
  completed_by: number | null;
  completed_at: string | null;
}

export interface HouseholdPlanList {
  id: number;
  title: string;
  description: string | null;
  tasks: HouseholdTask[];
}

export interface HouseholdZone {
  room: string;
  total: number;
  done: number;
}

export interface HouseholdResponse {
  household: HouseholdInfo | null;
  role?: 'owner' | 'member';
  members?: HouseholdMember[];
  plan?: HouseholdPlanList[];
  zones?: HouseholdZone[];
}
