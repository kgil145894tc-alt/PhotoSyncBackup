export type UserRole = 'admin' | 'client';

export type AuthRedirectRoute = '/home' | '/photographer';

export type AuthProfile = {
  fullName: string | null;
  id: string;
  role: UserRole;
};
