import { supabase } from '@/lib/supabase';
import { normalizeUsername, validateUsername } from '@/services/profile';
import { AuthRedirectRoute, UserRole } from '@/types/auth';

const AUTH_TIMEOUT_MS = 12000;
const PUSH_CLEANUP_TIMEOUT_MS = 2500;

type AuthResult = {
  message?: string;
  route?: AuthRedirectRoute;
};

export async function signInWithPhotoSync(emailOrUsername: string, password: string): Promise<AuthResult> {
  const loginId = emailOrUsername.trim().toLowerCase();

  if (!loginId || !password) {
    return { message: 'Please enter your email/username and password.' };
  }

  if (!supabase) {
    return {
      message: 'Supabase is not connected yet. Please check your .env values.',
    };
  }

  const email = loginId.includes('@') ? loginId : await getEmailForUsername(loginId);

  if (!email) {
    return { message: 'No account found with that username.' };
  }

  const { data, error } = await withTimeout(
    supabase.auth.signInWithPassword({
      email,
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
  username,
}: {
  email: string;
  fullName: string;
  password: string;
  username: string;
}): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = normalizeUsername(username);
  const usernameError = validateUsername(normalizedUsername);

  if (!fullName.trim() || !normalizedEmail || !password || !normalizedUsername) {
    return { message: 'Please complete all required fields.' };
  }

  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(normalizedEmail)) {
    return { message: 'Please enter a valid email address, like name@example.com.' };
  }

  if (usernameError) {
    return { message: usernameError };
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

  try {
    const existingUsernameEmail = await getEmailForUsername(normalizedUsername);

    if (existingUsernameEmail) {
      return { message: 'That username is already taken. Please choose another one.' };
    }
  } catch (error) {
    return { message: error instanceof Error ? error.message : 'Username setup could not be checked.' };
  }

  const { data, error } = await withTimeout(
    supabase.auth.signUp({
      email: normalizedEmail,
      options: {
        data: {
          full_name: fullName.trim(),
          role: 'client',
          username: normalizedUsername,
        },
      },
      password,
    }),
    'Signup is taking too long. Please check your internet connection and Supabase API key.',
  );

  if (error) {
    return { message: getFriendlyAuthMessage(error.message) };
  }

  if (data.user && data.session) {
    const { error: profileError } = await withTimeout(
      supabase.from('profiles').upsert({
        email: normalizedEmail,
        full_name: fullName.trim(),
        id: data.user.id,
        role: 'client',
        username: normalizedUsername,
      }, { onConflict: 'id' }),
      'Account was created, but saving the profile took too long.',
    );

    if (profileError) {
      return { message: getFriendlyAuthMessage(profileError.message) };
    }
  }

  if (!data.session) {
    return { message: 'Account created. Please confirm your email before logging in.' };
  }

  return { route: '/home' };
}

async function getEmailForUsername(username: string) {
  const normalizedUsername = normalizeUsername(username);
  const usernameError = validateUsername(normalizedUsername);

  if (usernameError || !supabase) {
    return null;
  }

  const { data, error } = await withTimeout(
    supabase.rpc('get_email_for_username', { p_username: normalizedUsername }),
    'Username login is taking too long. Please check your internet connection.',
  );

  if (error) {
    throw new Error(
      error.message.toLowerCase().includes('function')
        ? 'Username login is not set up yet. Run docs/supabase-usernames.sql in Supabase SQL Editor.'
        : error.message,
    );
  }

  return typeof data === 'string' && data ? data : null;
}

export async function signOutPhotoSync() {
  if (supabase) {
    const controller = new AbortController();
    try {
      await withTimeout((async () => {
        const { removeCurrentPushNotificationToken } = await import('@/services/push-notifications');
        if (!controller.signal.aborted) {
          await removeCurrentPushNotificationToken({ signal: controller.signal });
        }
      })(), 'Notification cleanup timed out.', PUSH_CLEANUP_TIMEOUT_MS);
    } catch {
      console.warn('Notification cleanup did not finish. Continuing sign-out; server session cleanup will remove its registration.');
    } finally {
      // Abort unfinished cleanup so it cannot reach a later account's session.
      controller.abort();
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }
}

export async function getSignedInUserRole(): Promise<UserRole | null> {
  if (!supabase) {
    return null;
  }

  const { data: sessionData } = await withTimeout(
    supabase.auth.getSession(),
    'Checking your session is taking too long. Please log in again.',
  );

  if (sessionData.session?.user) {
    return getUserRole(sessionData.session.user.id);
  }

  const { data, error } = await withTimeout(
    supabase.auth.getUser(),
    'Checking your session is taking too long. Please log in again.',
  );

  if (error || !data.user) {
    return null;
  }

  return getUserRole(data.user.id);
}

export async function sendPasswordResetEmail(email: string, redirectTo: string): Promise<AuthResult> {
  const normalizedEmail = email.trim();

  if (!normalizedEmail) {
    return { message: 'Please enter the email address for your account.' };
  }

  if (!supabase) {
    return {
      message: 'Supabase is not connected yet. Please check your .env values.',
    };
  }

  const { error } = await withTimeout(
    supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo }),
    'Sending the reset email is taking too long. Please check your internet connection.',
  );

  if (error) {
    return { message: getFriendlyAuthMessage(error.message) };
  }

  return { message: 'Password reset email sent. Please check your inbox.' };
}

export async function createPasswordRecoverySession(url: string): Promise<AuthResult> {
  if (!supabase) {
    return {
      message: 'Supabase is not connected yet. Please check your .env values.',
    };
  }

  const params = getUrlParams(url);
  const errorCode = params.get('error_code') ?? params.get('error');

  if (errorCode) {
    return { message: params.get('error_description') ?? errorCode };
  }

  const code = params.get('code');

  if (code) {
    const { error } = await withTimeout(
      supabase.auth.exchangeCodeForSession(code),
      'Verifying the reset link is taking too long. Please try opening it again.',
    );

    if (error) {
      return { message: getFriendlyAuthMessage(error.message) };
    }

    return {};
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (accessToken && refreshToken) {
    const { error } = await withTimeout(
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
      'Verifying the reset link is taking too long. Please try opening it again.',
    );

    if (error) {
      return { message: getFriendlyAuthMessage(error.message) };
    }

    return {};
  }

  return { message: 'This password reset link is missing its verification code.' };
}

export async function updatePasswordFromRecovery(password: string): Promise<AuthResult> {
  if (password.length < 6) {
    return { message: 'Password must be at least 6 characters.' };
  }

  if (!supabase) {
    return {
      message: 'Supabase is not connected yet. Please check your .env values.',
    };
  }

  const { error } = await withTimeout(
    supabase.auth.updateUser({ password }),
    'Updating your password is taking too long. Please check your internet connection.',
  );

  if (error) {
    return { message: getFriendlyAuthMessage(error.message) };
  }

  return { message: 'Password updated. Please log in with your new password.', route: '/login' };
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

function withTimeout<T>(promise: PromiseLike<T>, message: string, timeoutMs = AUTH_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);

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

  if (
    normalizedMessage.includes('already registered') ||
    normalizedMessage.includes('already exists') ||
    normalizedMessage.includes('user already')
  ) {
    return 'This email already has an account. Please log in instead, or reset your password if you cannot access it.';
  }

  if (normalizedMessage.includes('duplicate') || normalizedMessage.includes('unique')) {
    return 'That username is already taken. Please choose another one.';
  }

  if (normalizedMessage.includes('username')) {
    return `${message}. If username setup is missing, run docs/supabase-usernames.sql in Supabase SQL Editor.`;
  }

  return message;
}

function getUrlParams(url: string) {
  const params = new URLSearchParams();

  for (const part of getUrlParameterParts(url)) {
    new URLSearchParams(part).forEach((value, key) => {
      params.set(key, value);
    });
  }

  return params;
}

function getUrlParameterParts(url: string) {
  const parts: string[] = [];
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');

  if (queryIndex >= 0) {
    const queryEnd = hashIndex >= 0 ? hashIndex : url.length;
    parts.push(url.slice(queryIndex + 1, queryEnd));
  }

  if (hashIndex >= 0) {
    const hash = url.slice(hashIndex + 1);
    const hashQueryIndex = hash.indexOf('?');
    parts.push(hashQueryIndex >= 0 ? hash.slice(hashQueryIndex + 1) : hash);
  }

  return parts.filter(Boolean);
}
