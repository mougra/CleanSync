/** Сезон челленджа. Совпадает со значениями колонки `challenges.season`. */
export type ChallengeSeason = 'winter' | 'spring' | 'summer' | 'autumn';

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
  /** active — идёт прямо сейчас. Приходит из `GET /api/challenges/active`. */
  status?: string;
  startedAt?: string | null;
  challenge: ChallengeSummary;
  progress: ChallengeProgress;
  days: ChallengeDay[];
}

export interface ActiveChallengeResponse {
  /**
   * Первый активный челлендж — оставлен ради совместимости.
   * У человека может быть несколько незакрытых, полный список — в `actives`.
   */
  active: ActiveChallenge | null;
  /** Все незакрытые челленджи: прошлый сезон не закрыт, новый уже начат. */
  actives?: ActiveChallenge[];
}

export interface ChallengeDetail {
  challenge: ChallengeSummary;
  progress: ChallengeProgress;
  days: ChallengeDay[];
}

/**
 * Ответ `GET /api/challenges/current` — сезонный челлендж пользователя в одном
 * из четырёх состояний. `season` приходит во всех вариантах, но необязателен:
 * типы не должны падать, если поле уберут.
 */
export interface CurrentChallengeAvailable {
  status: 'available';
  season?: string | null;
  challenge: ChallengeSummary;
  days: ChallengeDay[];
  progress: ChallengeProgress;
}

export interface CurrentChallengeActive {
  status: 'active';
  season?: string | null;
  userChallengeId?: number;
  /** Момент первой отметки: отдельного «старта» больше нет. */
  startedAt?: string | null;
  challenge: ChallengeSummary;
  days: ChallengeDay[];
  progress: ChallengeProgress;
}

export interface CurrentChallengeCompleted {
  status: 'completed';
  season?: string | null;
  challengeSlug?: string;
  finishedAt: string | null;
  /*
   * Дней у закрытого челленджа API пока не отдаёт — их отсутствие штатное.
   * Если однажды появится `challenge`/`days`/`progress`, страница покажет
   * разметку для просмотра пройденного без правок в логике.
   */
  challenge?: ChallengeSummary;
  days?: ChallengeDay[];
  progress?: ChallengeProgress;
}

export interface CurrentChallengeNone {
  status: 'none';
  season?: string | null;
}

export type CurrentChallenge =
  | CurrentChallengeAvailable
  | CurrentChallengeActive
  | CurrentChallengeCompleted
  | CurrentChallengeNone;

/** Ответ `PATCH /api/challenges/tasks/:taskId`. */
export interface ChallengeTaskToggleResponse {
  userChallengeId: number;
  status: string;
  progress: ChallengeProgress;
  days: ChallengeDay[];
  awarded?: string[];
}
