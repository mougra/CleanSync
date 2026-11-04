export interface AuthUser {
  id: number;
  email: string;
  username?: string | null;
  avatar_url?: string | null;
  is_email_confirmed?: boolean;
  /** Напоминания о плане: `false` — человек выключил их в настройках или из письма. */
  digest_enabled?: boolean;
  /** Время дневного напоминания в формате HH:MM (по часовому поясу профиля). */
  notification_time?: string | null;
}
