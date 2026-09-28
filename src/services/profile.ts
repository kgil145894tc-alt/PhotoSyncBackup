import { supabase } from '@/lib/supabase';

export type UserProfile = {
  avatarUrl: string | null;
  email: string;
  fullName: string;
  phone: string;
  role: 'admin' | 'client';
  username: string;
};

export type ProfileFormValues = {
  avatarUrl?: string | null;
  fullName: string;
  phone: string;
  username: string;
};

type ProfileRow = {
  avatar_url?: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: 'admin' | 'client' | null;
  username?: string | null;
};

export async function getMyProfile(): Promise<UserProfile | null> {
  if (!supabase) {
    return null;
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('avatar_url, email, full_name, phone, role, username')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (error || !data) {
    return {
      avatarUrl: null,
      email: userData.user.email ?? '',
      fullName: userData.user.user_metadata?.full_name ?? '',
      phone: '',
      role: 'client',
      username: userData.user.user_metadata?.username ?? getFallbackUsername(userData.user.email ?? ''),
    };
  }

  return mapProfileRow(data as ProfileRow, userData.user.email ?? '');
}

export async function updateMyProfile(values: ProfileFormValues) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return { message: 'Please log in again before updating your profile.', success: false };
  }

  const normalizedUsername = normalizeUsername(values.username);
  const usernameError = validateUsername(normalizedUsername);

  if (usernameError) {
    return { message: usernameError, success: false };
  }

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  const role = currentProfile?.role === 'admin' ? 'admin' : 'client';

  const { error } = await supabase
    .from('profiles')
    .upsert({
      avatar_url: values.avatarUrl ?? null,
      email: userData.user.email ?? null,
      full_name: values.fullName.trim(),
      id: userData.user.id,
      phone: values.phone.trim(),
      role,
      username: normalizedUsername,
    }, { onConflict: 'id' })
    .select('id')
    .single();

  if (error) {
    if (error.message.toLowerCase().includes('bucket not found')) {
      return {
        message: 'The profile-images storage bucket is missing. Run docs/supabase-profile-images.sql in Supabase SQL Editor, then try again.',
        success: false,
      };
    }

    if (error.code === '23505' || error.message.toLowerCase().includes('duplicate')) {
      return { message: 'That username is already taken. Please choose another one.', success: false };
    }

    if (error.message.toLowerCase().includes('username')) {
      return {
        message: `${error.message}. If the username column is missing, run docs/supabase-usernames.sql in Supabase SQL Editor.`,
        success: false,
      };
    }

    return { message: error.message, success: false };
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      full_name: values.fullName.trim(),
      username: normalizedUsername,
    },
  });

  if (metadataError) {
    return { message: metadataError.message, success: false };
  }

  return { success: true };
}

export async function updateMyPassword(password: string) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { message: error.message, success: false };
  }

  return { success: true };
}

export async function uploadProfileAvatar({
  fileName,
  mimeType,
  uri,
}: {
  fileName?: string | null;
  mimeType?: string | null;
  uri: string;
}) {
  if (!supabase) {
    return { message: 'Supabase is not connected yet.', success: false };
  }

  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return { message: 'Please log in again before uploading your photo.', success: false };
  }

  const extension = getFileExtension(fileName, mimeType);
  const path = `${userData.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const response = await fetch(uri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from('profile-images')
    .upload(path, blob, {
      contentType: mimeType ?? `image/${extension}`,
      upsert: false,
    });

  if (error) {
    return { message: error.message, success: false };
  }

  const { data } = supabase.storage.from('profile-images').getPublicUrl(path);

  return { publicUrl: data.publicUrl, success: true };
}

function mapProfileRow(row: ProfileRow, fallbackEmail: string): UserProfile {
  return {
    avatarUrl: row.avatar_url ?? null,
    email: row.email ?? fallbackEmail,
    fullName: row.full_name ?? '',
    phone: row.phone ?? '',
    role: row.role === 'admin' ? 'admin' : 'client',
    username: row.username ?? getFallbackUsername(fallbackEmail),
  };
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string) {
  if (!username) {
    return 'Please enter your username.';
  }

  if (username.length < 3) {
    return 'Username must be at least 3 characters.';
  }

  if (username.length > 30) {
    return 'Username must be 30 characters or less.';
  }

  if (!/^[a-z0-9._]+$/.test(username)) {
    return 'Username can only use letters, numbers, dots, and underscores.';
  }

  return null;
}

function getFallbackUsername(email: string) {
  return normalizeUsername(email.split('@')[0] ?? '');
}

function getFileExtension(fileName?: string | null, mimeType?: string | null) {
  const fileExtension = fileName?.split('.').pop()?.toLowerCase();

  if (fileExtension && fileExtension.length <= 5) {
    return fileExtension === 'jpeg' ? 'jpg' : fileExtension;
  }

  if (mimeType?.includes('/')) {
    const mimeExtension = mimeType.split('/').pop()?.toLowerCase();

    if (mimeExtension) {
      return mimeExtension === 'jpeg' ? 'jpg' : mimeExtension;
    }
  }

  return 'jpg';
}
