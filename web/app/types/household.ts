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
  avatar_url: string | null;
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

/** Один дом целиком: карточка, моя роль в нём и содержимое. */
export interface HouseholdEntry {
  household: HouseholdInfo;
  role: 'owner' | 'member';
  members: HouseholdMember[];
  plan: HouseholdPlanList[];
  zones: HouseholdZone[];
}

/**
 * Домов у пользователя может быть несколько, поэтому основной формат — список.
 * `household` остаётся в ответах на изменяющие запросы: это тот дом, который
 * изменился (удобно для инлайновых подсказок).
 */
export interface HouseholdListResponse {
  households: HouseholdEntry[];
}

export interface HouseholdMutationResponse extends HouseholdListResponse {
  household: HouseholdEntry | null;
  left?: boolean;
  householdId?: number;
}

/** Пустой список домов: состояние «домов ещё нет». */
export const emptyHouseholds = (): HouseholdListResponse => ({ households: [] });
