export type UserRole = 'admin' | 'client';

export type AuthRedirectRoute = '/home' | '/login' | '/photographer';

export type AuthProfile = {
  fullName: string | null;
  id: string;
  role: UserRole;
};
