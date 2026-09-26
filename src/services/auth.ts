import { supabase } from '@/lib/supabase';
import { AuthRedirectRoute, UserRole } from '@/types/auth';

const AUTH_TIMEOUT_MS = 12000;

type AuthResult = {
  message?: string;
  route?: AuthRedirectRoute;
};

export async function signInWithPhotoSync(emailOrUsername: string, password: string): Promise<AuthResult> {
  const username = emailOrUsername.trim().toLowerCase();

  if (!username || !password) {
    return { message: 'Please enter your email/username and password.' };
  }

  if (!supabase) {
    return {
      message: 'Supabase is not connected yet. Please check your .env values.',
    };
  }

  const { data, error } = await withTimeout(
    supabase.auth.signInWithPassword({
      email: emailOrUsername.trim(),
      password,
    }),
    'Login is taking too long. Please check your internet connection and Supabase API key.',
  );

  if (error) {
    return { message: getFriendlyAuthMessage(error.message) };
  }

  if (!data.user) {
    return { message: 'Login failed. Please check your Supabase configuration.' };
  }

  const role = await getUserRole(data.user.id);

  return { route: role === 'admin' ? '/photographer' : '/home' };
}

export async function signUpClientAccount({
  email,
  fullName,
  password,
}: {
  email: string;
  fullName: string;
  password: string;
}): Promise<AuthResult> {
  if (!fullName.trim() || !email.trim() || !password) {
    return { message: 'Please complete all required fields.' };
  }

  if (password.length < 6) {
    return { message: 'Password must be at least 6 characters.' };
  }

  if (!supabase) {
    return {
      message: 'Supabase is not connected yet. Continuing with the client prototype.',
      route: '/home',
    };
  }

  const { data, error } = await withTimeout(
    supabase.auth.signUp({
      email: email.trim(),
      options: {
        data: {
          full_name: fullName.trim(),
          role: 'client',
        },
      },
      password,
    }),
    'Signup is taking too long. Please check your internet connection and Supabase API key.',
  );

  if (error) {
    return { message: getFriendlyAuthMessage(error.message) };
  }

  if (data.user) {
    await withTimeout(
      supabase.from('profiles').upsert({
        full_name: fullName.trim(),
        id: data.user.id,
        role: 'client',
      }),
      'Account was created, but saving the profile took too long.',
    );
  }

  if (!data.session) {
    return { message: 'Account created. Please confirm your email before logging in.' };
  }

  return { route: '/home' };
}

export async function signOutPhotoSync() {
  if (supabase) {
    await supabase.auth.signOut();
  }
}

async function getUserRole(userId: string): Promise<UserRole> {
  if (!supabase) {
    return 'client';
  }

  const { data } = await withTimeout(
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
    'Login succeeded, but checking your role took too long.',
  );

  return data?.role === 'admin' ? 'admin' : 'client';
}

function withTimeout<T>(promise: PromiseLike<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function getFriendlyAuthMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('email not confirmed')) {
    return 'Please confirm your email before logging in.';
  }

  if (normalizedMessage.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }

  return message;
}
