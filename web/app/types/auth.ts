export interface AuthUser {
  id: number;
  email: string;
  username?: string | null;
  avatar_url?: string | null;
  is_email_confirmed?: boolean;
}
