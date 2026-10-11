import { supabase } from '@/lib/supabase';

let pendingSignIn: Promise<{ message?: string }> | null = null;

export function signInWithGoogle(): Promise<{ message?: string }> {
  if (pendingSignIn) return pendingSignIn;
  const attempt = performSignIn().finally(() => {
    if (pendingSignIn === attempt) pendingSignIn = null;
  });
  pendingSignIn = attempt;
  return attempt;
}

async function performSignIn(): Promise<{ message?: string }> {
  if (!supabase || typeof window === 'undefined') {
    return { message: 'Sign-in is unavailable. Please try again later.' };
  }

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: new URL('/login', window.location.origin).href,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) return { message: 'We could not sign in with Google. Please try again.' };
    // Supabase redirects the browser; the root auth subscription handles
    // role-based navigation once the returned session has been restored.
    return {};
  } catch {
    return { message: 'Google sign-in could not finish. Please try again.' };
  }
}
