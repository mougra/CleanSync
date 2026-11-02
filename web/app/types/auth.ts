export interface AuthUser {
  id: number;
  email: string;
  username?: string | null;
  avatar_url?: string | null;
  is_email_confirmed?: boolean;
  /** Недельное письмо с планом: `false` — человек отписался в настройках или из письма. */
  digest_enabled?: boolean;
}
